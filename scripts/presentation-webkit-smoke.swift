// Run after npm run build: swift scripts/presentation-webkit-smoke.swift
import AppKit
import WebKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
final class Assets: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let url = task.request.url!
        let path = url.path == "/" ? "index.html" : String(url.path.dropFirst())
        do {
            let data = try Data(contentsOf: root.appendingPathComponent("dist/" + path))
            let mime = path.hasSuffix(".js") ? "text/javascript" : path.hasSuffix(".css") ? "text/css" : "text/html"
            task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
            task.didReceive(data)
            task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
let app = NSApplication.shared
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.setURLSchemeHandler(Assets(), forURLScheme: "pandecki-test")
let fixture = try String(contentsOf: root.appendingPathComponent("scripts/presentation-webkit-smoke.js"), encoding: .utf8)
config.userContentController.addUserScript(WKUserScript(source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 720), configuration: config)
web.load(URLRequest(url: URL(string: "pandecki-test://app/index.html?presentation=1")!))
func check(_ phase: Int) {
    web.evaluateJavaScript("window.presentationSmoke(\(phase))") { result, error in
        if let error = error { print("FAIL \(phase): \(error)"); exit(1) }
        print(result ?? "missing result")
        if phase == 4 { exit(0) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { check(phase + 1) }
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 4) { check(1) }
DispatchQueue.main.asyncAfter(deadline: .now() + 15) { print("TIMEOUT"); exit(1) }
app.run()
