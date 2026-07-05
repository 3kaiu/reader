//! JS selector dispatcher — sandboxed JavaScript execution
//!
//! Legado `@js:` and `<js>...</js>` snippets are executed in a persistent
//! Node.js worker process that eliminates per-expression subprocess startup.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const JS_EXECUTION_TIMEOUT: Duration = Duration::from_secs(10);
const WORKER_IDLE_TIMEOUT: Duration = Duration::from_secs(300);

static WORKER_FAILED: AtomicBool = AtomicBool::new(false);

struct JsWorker {
    stdin: ChildStdin,
    stdout: Option<BufReader<std::process::ChildStdout>>,
    _child: Child,
    last_used: Instant,
}

impl JsWorker {
    fn start() -> Option<Self> {
        let worker_script = r#"
// Sandbox: block dangerous modules and globals
const _origRequire = require;
const _blocked = new Set(['child_process','fs','net','tls','dgram','cluster','v8','vm','module','worker_threads']);
const _sandbox_require = (m) => {
    if (_blocked.has(m)) throw new Error(`module '${m}' is not allowed`);
    return _origRequire(m);
};
require = _sandbox_require;
// Block process-level escapes
process.exit = () => { throw new Error('process.exit is not allowed'); };
process.kill = () => { throw new Error('process.kill is not allowed'); };
process.abort = () => { throw new Error('process.abort is not allowed'); };
// Disable process.binding (native addon access)
if (process.binding) process.binding = () => { throw new Error('process.binding is not allowed'); };

const rl = _sandbox_require('readline').createInterface({input:process.stdin,output:process.stdout,terminal:false});
rl.on('line',(line)=>{
    let r; try{r=JSON.parse(line)}catch(e){console.log(JSON.stringify({error:'parse'}));return}
    const result=r.result,baseUrl=r.baseUrl,enc=(s)=>globalThis.encodeURIComponent(s),dec=(s)=>globalThis.decodeURIComponent(s);
    try{const v=eval(r.code);console.log(JSON.stringify({id:r.id,value:v===null||v===undefined?null:String(v)}))}
    catch(e){console.log(JSON.stringify({id:r.id,value:null,error:e.message}))}
});
"#;
        let mut child = match Command::new("node")
            .arg("-e")
            .arg(worker_script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("JS worker start failed: {}", e);
                WORKER_FAILED.store(true, Ordering::Relaxed);
                return None;
            }
        };
        let stdin = child.stdin.take()?;
        let stdout = BufReader::new(child.stdout.take()?);
        WORKER_FAILED.store(false, Ordering::Relaxed);
        tracing::debug!("JS worker started");
        Some(Self { stdin, stdout: Some(stdout), _child: child, last_used: Instant::now() })
    }

    fn execute(&mut self, code: &str, result: &str, base_url: &str) -> Option<String> {
        self.last_used = Instant::now();
        let request = serde_json::json!({
            "id": 1,
            "code": code,
            "result": result,
            "baseUrl": base_url,
        });
        if writeln!(self.stdin, "{}", request).is_err() {
            return None;
        }
        if self.stdin.flush().is_err() {
            return None;
        }

        // Read response with timeout: spawn a thread, send stdout back via channel
        let mut stdout = self.stdout.take()?;
        let (result_tx, result_rx) = mpsc::channel();
        let (stdout_tx, stdout_rx) = mpsc::channel();
        thread::spawn(move || {
            let mut buf = String::new();
            let _ = stdout.read_line(&mut buf);
            let _ = result_tx.send(buf);
            let _ = stdout_tx.send(stdout);
        });

        let response = match result_rx.recv_timeout(JS_EXECUTION_TIMEOUT) {
            Ok(resp) if !resp.is_empty() => resp,
            _ => {
                // Timeout: stdout was consumed by the thread, worker is dead
                tracing::warn!("JS worker read timed out");
                return None;
            }
        };

        // Restore stdout from the reader thread
        self.stdout = stdout_rx.recv().ok();

        match serde_json::from_str::<serde_json::Value>(&response) {
            Ok(json) => match json.get("value") {
                Some(v) if !v.is_null() => Some(v.as_str().unwrap_or_default().to_string()),
                _ => None,
            },
            Err(_) => None,
        }
    }

    fn is_idle_expired(&self) -> bool {
        self.last_used.elapsed() > WORKER_IDLE_TIMEOUT
    }
}

static JS_WORKER: Mutex<Option<JsWorker>> = Mutex::new(None);

fn with_worker<F, R>(f: F) -> Option<R>
where
    F: FnOnce(&mut JsWorker) -> Option<R>,
{
    let mut guard = match JS_WORKER.lock() {
        Ok(g) => g,
        Err(_) => return None,
    };

    if let Some(ref w) = *guard {
        if w.is_idle_expired() || w.stdout.is_none() {
            *guard = None;
        }
    }

    if guard.is_some() && WORKER_FAILED.load(Ordering::Relaxed) {
        *guard = None;
        WORKER_FAILED.store(false, Ordering::Relaxed);
    }

    if guard.is_none() {
        *guard = JsWorker::start();
    }

    match guard.as_mut() {
        Some(ref mut w) => f(w),
        None => None,
    }
}

pub fn execute_js(js_code: &str, result: &str, base_url: &str) -> Option<String> {
    let code = js_code.trim();
    if code.is_empty() { return None; }
    let code = code
        .strip_prefix("@js:")
        .or_else(|| if code.starts_with("<js>") && code.ends_with("</js>") { Some(&code[4..code.len() - 6]) } else { None })
        .unwrap_or(code).trim();
    if code.is_empty() { return None; }
    let wrapped = if code.starts_with("function") || code.starts_with("if") || code.contains(';') {
        format!("(function(){{ {} }})()", code)
    } else {
        format!("(function(){{ try {{ return ({}); }} catch(e) {{ return null; }} }})()", code)
    };

    // First attempt via persistent worker
    if let Some(v) = with_worker(|w| w.execute(&wrapped, result, base_url)) {
        return Some(v);
    }

    // Worker failed — restart once and retry
    if let Ok(mut guard) = JS_WORKER.lock() {
        *guard = None;
        *guard = JsWorker::start();
    }
    if let Some(v) = with_worker(|w| w.execute(&wrapped, result, base_url)) {
        return Some(v);
    }

    // Fall back to one-shot subprocess
    execute_via_node_fallback(&wrapped, result, base_url)
}

fn execute_via_node_fallback(code: &str, result: &str, base_url: &str) -> Option<String> {
    let wrapped = format!(
        r#"const _b=require;const _bl=new Set(['child_process','fs','net','tls','dgram','cluster','v8','vm','module','worker_threads']);require=(m)=>{{if(_bl.has(m))throw new Error('module '+m+' not allowed');return _b(m);}};process.exit=()=>{{}};process.kill=()=>{{}};const result={};const baseUrl={};try{{const v=eval({});console.log(v===null||v===undefined?'null':String(v))}}catch(e){{console.log('null')}}"#,
        serde_json::to_string(result).unwrap_or_default(),
        serde_json::to_string(base_url).unwrap_or_default(),
        serde_json::to_string(code).unwrap_or_default()
    );
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();
    let c = wrapped.clone();
    std::thread::spawn(move || {
        let _ = tx.send(std::process::Command::new("node").arg("-e").arg(&c).output());
    });
    match rx.recv_timeout(JS_EXECUTION_TIMEOUT) {
        Ok(Ok(o)) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s == "null" || s.is_empty() { None } else { Some(s) }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_expression() {
        let result = execute_js("'hello' + ' world'", "", "");
        assert_eq!(result, Some("hello world".to_string()));
    }

    #[test]
    fn test_regex_match() {
        let result = execute_js(r"'/book/123.html'.match(/\d+/)[0]", "", "");
        assert_eq!(result, Some("123".to_string()));
    }

    #[test]
    fn test_with_result_variable() {
        let result = execute_js("result + ' suffix'", "prefix", "");
        assert_eq!(result, Some("prefix suffix".to_string()));
    }

    #[test]
    fn test_empty_js() {
        let result = execute_js("", "", "");
        assert_eq!(result, None);
    }
}