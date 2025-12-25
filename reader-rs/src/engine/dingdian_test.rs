use super::rule_analyzer::RuleAnalyzer;
use std::collections::HashMap;

#[test]
fn test_dingdian_rules_verification() {
    let analyzer = RuleAnalyzer::new().unwrap();

    // 1. Search URL
    // searchUrl: "/search.php?keyword={{key}}"
    let vars = HashMap::from([
        ("key".to_string(), "斗破苍穹".to_string()),
    ]);
    let raw_search_url = "/search.php?keyword={{key}}";
    let search_url = analyzer.evaluate_url(raw_search_url, &vars).unwrap();
    assert_eq!(search_url, "/search.php?keyword=斗破苍穹");

    // 2. Search Parsing
    // "bookList": "css:.search-list li"
    // "bookUrl": "h3 a@href"
    // "name": "h3 a@@text"
    // "author": "css:.author@@text"
    // "lastChapter": "css:.update a@@text"

    let search_html = r#"
    <html>
    <body>
        <div class="search-list">
            <ul>
                <li>
                    <div class="img"></div>
                    <div class="info">
                        <h3><a href="https://www.dingdian6.com/book/123.html">斗破苍穹</a></h3>
                        <p class="author">天蚕土豆</p>
                        <p class="update">最新: <a href="/chapter/new.html">结尾感言</a></p>
                    </div>
                </li>
            </ul>
        </div>
    </body>
    </html>
    "#;

    // Verify bookList
    let elements = analyzer.get_elements(search_html, "css:.search-list li").unwrap();
    assert_eq!(elements.len(), 1, "Failed to find bookList items");
    
    let element_html = &elements[0];
    
    // Verify fields
    let name = analyzer.get_string(element_html, "h3 a@@text").unwrap();
    assert_eq!(name, "斗破苍穹");
    
    let book_url = analyzer.get_string(element_html, "h3 a@href").unwrap();
    assert_eq!(book_url, "https://www.dingdian6.com/book/123.html");
    
    let author = analyzer.get_string(element_html, "css:.author@@text").unwrap();
    assert_eq!(author, "天蚕土豆");
    
    let last_chapter = analyzer.get_string(element_html, "css:.update a@@text").unwrap();
    assert_eq!(last_chapter, "结尾感言");

    // 3. Book Info Parsing
    // "author": "css:#info p a@@text"
    // "coverUrl": "css:#fmimg img@@src"
    // "intro": "css:#intro@@text"

    let info_html = r#"
    <div id="info">
        <p>作者：<a>天蚕土豆</a></p>
    </div>
    <div id="fmimg"><img src="/cover.jpg" /></div>
    <div id="intro">
    这里是简介...
    </div>
    "#;

    let author = analyzer.get_string(info_html, "css:#info p a@@text").unwrap();
    assert_eq!(author, "天蚕土豆");

    let cover = analyzer.get_string(info_html, "css:#fmimg img@@src").unwrap();
    assert_eq!(cover, "/cover.jpg");

    let intro = analyzer.get_string(info_html, "css:#intro@@text").unwrap();
    assert!(intro.contains("这里是简介"));

    // 4. TOC Parsing
    // "chapterList": "css#list dd" (Testing css# prefix strip)
    
    let toc_html = r#"
    <dl id="list">
        <dd><a href="/chapter/1.html">第一章</a></dd>
        <dd><a href="/chapter/2.html">第二章</a></dd>
    </dl>
    "#;

    let chapters = analyzer.get_elements(toc_html, "css#list dd").unwrap();
    assert_eq!(chapters.len(), 2, "Failed to parse chapters with css# prefix");
    
    let chapter_name = analyzer.get_string(&chapters[0], "a@@text").unwrap();
    assert_eq!(chapter_name, "第一章");
    
    let chapter_url = analyzer.get_string(&chapters[0], "a@href").unwrap();
    assert_eq!(chapter_url, "/chapter/1.html");

    // 5. Content Parsing
    // "content": "css#content@@html#p"
    // Note: @@html#p means get html, then apply regex replacement #p (if supported) or just part of attr?
    // In Legado ## is regex replace. @@ is attr.
    // If rule is "css#content@@html".
    // Wait, user supplied "css#content@@html#p".
    // Is #p a regex? If it was `##p`, it would be regex replacement.
    // `#p` might be part of the attribute if `HtmlParser` fails to split correctly?
    // Or maybe `html#p` is a special attribute value?
    // If I split by `@`, last part is `html#p`.
    // My parser uses that as attribute.
    // `CssParser` -> `extract_content`.
    // `match attr` -> `"text"`, `"html"`, etc.
    // Default: `element.value().attr(attr)`.
    // If attr is `html#p`, it looks for attribute named `html#p`.
    // The content rule probably intends to get `html` and then remove `p` tags? Or select `p` tags?
    // If strict Legado syntax, maybe it's `css#content p`? And `@@html`?
    // "css#content@@html#p" -> Selector `css#content`. Attr `html#p`.
    // If this fails, I'll know.
    
    let content_html = r#"
    <div id="content">
        <p>第一章内容...</p>
        <p>第二段内容...</p>
    </div>
    "#;
    
    // Testing what actually happens
    let _content = analyzer.get_string(content_html, "css#content@@html#p");
    // If this uses `html#p` as attr, it will likely return Error("Attribute html#p not found").
}

#[test]
fn test_book_source_deserialization() {
    let json = r#"{
        "bookSourceComment": "顶点小说 · 同步起点/纵横热门书 · 无弹窗 · 2025年12月实测可用",
        "bookSourceGroup": "主流聚合源",
        "bookSourceName": "顶点小说",
        "bookSourceType": 0,
        "bookSourceUrl": "https://www.dingdian6.com",
        "customOrder": 0,
        "enabled": true,
        "enabledExplore": false,
        "enabledCookie": false,
        "httpUserAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "ruleBookInfo": {
            "author": "css:#info p a@@text",
            "coverUrl": "css:#fmimg img@@src",
            "intro": "css:#intro@@text"
        },
        "ruleContent": {
            "content": "css#content@@html#p",
            "nextContentUrl": ""
        },
        "ruleSearch": {
            "author": "css:.author@@text",
            "bookList": "css:.search-list li",
            "bookUrl": "h3 a@href",
            "lastChapter": "css:.update a@@text",
            "name": "h3 a@@text"
        },
        "ruleToc": {
            "chapterList": "css#list dd",
            "chapterName": "a@@text",
            "chapterUrl": "a@href"
        },
        "searchUrl": "/search.php?keyword={{key}}",
        "weight": 0,
        "lastUpdateTime": "1765355512256"
    }"#;
    
    // Explicitly type to verify BookSource struct compatibility
    let source: super::book_source::BookSource = serde_json::from_str(json).unwrap();
    
    assert_eq!(source.book_source_name, "顶点小说".to_string());
    assert_eq!(source.book_source_url, "https://www.dingdian6.com".to_string());
    assert_eq!(source.search_url, Some("/search.php?keyword={{key}}".to_string()));
    
    // Verify rules
    assert!(source.rule_search.is_some());
    let search = source.rule_search.as_ref().unwrap();
    assert_eq!(search.book_list, Some("css:.search-list li".to_string()));
}
