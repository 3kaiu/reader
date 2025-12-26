// Universal Bridge Shim
// This script creates global proxies that forward calls to the Rust native bridge

(function() {
    // Recursive Proxy Handler
    // Allows chaining like utils.base64.encode()
    // The 'path' accumulates the access path (e.g. "utils.base64.encode")
    // When called, it invokes the Rust bridge.
    
    function createRecursiveProxy(path) {
        // The target is a function so it can be called
        const target = function() {};
        
        return new Proxy(target, {
            get: function(target, prop, receiver) {
                // Special handling for common properties to avoid issues
                if (prop === 'then' || prop === 'catch' || prop === 'toJSON') return undefined;
                if (prop === 'toString' || prop === Symbol.toPrimitive) return () => "[NativeBridgeProxy " + path + "]";
                
                // Continue chaining
                const nextPath = path ? (path + '.' + prop) : prop;
                return createRecursiveProxy(nextPath);
            },
            
            apply: function(target, thisArg, args) {
                // Function call occurred!
                // e.g. java.base64Encode('foo') -> path="java.base64Encode"
                
                // Deconstruct path into namespace and method
                // We treat the last segment as the method, the rest as namespace
                const lastDot = path.lastIndexOf('.');
                let ns, method;
                
                if (lastDot === -1) {
                    ns = "global";
                    method = path;
                } else {
                    ns = path.substring(0, lastDot); // "java" or "utils.base64"
                    method = path.substring(lastDot + 1); // "base64Encode" or "encode"
                }

                // Convert args to strings
                const strArgs = args.map(arg => {
                    if (arg === null || arg === undefined) return "";
                    if (typeof arg === 'object') return JSON.stringify(arg);
                    return String(arg);
                });
                
                return _rust_native_call(ns, method, strArgs);
            }
        });
    }

    // Initialize globals
    globalThis.java = createRecursiveProxy("java");
    globalThis.native = globalThis.java;
    globalThis.utils = createRecursiveProxy("utils");
    globalThis.cookie = createRecursiveProxy("cookie");
    globalThis.source = createRecursiveProxy("source");

})();
