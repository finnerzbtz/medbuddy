import Capacitor
import UserNotifications
import AVFAudio

class ReminduhBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LeafStorePlugin())
        bridge?.registerPluginInstance(ReminduhAuthPlugin())
        bridge?.registerPluginInstance(BlobbyMusicPlugin())
        bridge?.registerPluginInstance(ReminduhDevicePlugin())
    }
}

import Foundation
import Security

/// Managed auth uses HttpOnly cookies. Keep the native cookie in Keychain rather
/// than WKWebView/localStorage; only short-lived API JWTs reach the web layer.
@objc(ReminduhAuthPlugin)
public class ReminduhAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReminduhAuthPlugin"
    public let jsName = "ReminduhAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]
    private let hosts = [
        "ep-fancy-morning-za5k9op1.neonauth.c-2.eu-west-2.aws.neon.tech",
        "ep-frosty-water-zamgixq9.neonauth.c-2.eu-west-2.aws.neon.tech"
    ]
    private let routes = ["/get-session", "/token", "/sign-out", "/email-otp/send-verification-otp", "/sign-in/email-otp"]
    private let cookieName = "__Secure-neon-auth.session_token"
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        return URLSession(configuration: config, delegate: NoAuthRedirect(), delegateQueue: nil)
    }()
    private func baseURL(_ call: CAPPluginCall) -> URL? {
        guard let raw = call.getString("baseUrl"), let url = URL(string: raw), url.scheme == "https",
              let host = url.host, hosts.contains(host), url.path == "/reminduh/auth",
              url.query == nil, url.fragment == nil, url.user == nil, url.password == nil, url.port == nil else { return nil }
        return url
    }
    private func key(_ base: URL) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.reminduh.auth.v1", kSecAttrAccount as String: base.absoluteString]
    }
    private func loadCookie(_ base: URL) throws -> String? {
        var query = key(base); query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data, let text = String(data: bytes, encoding: .utf8) else { throw AuthStorageError.failed }
        return text
    }
    private func storeCookie(_ value: String?, base: URL) throws {
        guard let value else {
            let status = SecItemDelete(key(base) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw AuthStorageError.failed }
            return
        }
        let bytes = Data(value.utf8)
        let status = SecItemUpdate(key(base) as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
        if status == errSecItemNotFound {
            var item = key(base); item[kSecValueData as String] = bytes
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw AuthStorageError.failed }
        } else if status != errSecSuccess { throw AuthStorageError.failed }
    }
    @objc func clear(_ call: CAPPluginCall) {
        guard let base = baseURL(call) else { call.reject("Invalid authentication service."); return }
        do { try storeCookie(nil, base: base); call.resolve() }
        catch { call.reject("The saved sign-in could not be cleared. Please try again.") }
    }
    @objc func request(_ call: CAPPluginCall) {
        guard let base = baseURL(call), let path = call.getString("path"), routes.contains(path),
              let method = call.getString("method"), method == (path == "/get-session" || path == "/token" ? "GET" : "POST"),
              let url = URL(string: base.absoluteString + path) else { call.reject("Invalid authentication request."); return }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.setValue("https://" + base.host!, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
            if let cookie = try loadCookie(base) { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
            if let body = call.getString("body") {
                guard body.utf8.count <= 4096 else { call.reject("Authentication request is too large."); return }
                request.httpBody = Data(body.utf8)
            }
            session.dataTask(with: request) { [weak self] data, response, error in
                guard let self, error == nil, let response = response as? HTTPURLResponse else { call.reject("Couldn’t connect. Try again when you’re online."); return }
                do {
                    var headers: [String: String] = [:]
                    for (key, value) in response.allHeaderFields { headers[String(describing: key)] = String(describing: value) }
                    for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: base) where cookie.name == self.cookieName {
                        let expired = cookie.value.isEmpty || (cookie.expiresDate.map { $0 <= Date() } ?? false)
                        try self.storeCookie(expired ? nil : self.cookieName + "=" + cookie.value, base: base)
                    }
                    var reply: JSObject = ["status": response.statusCode, "body": NSNull()]
                    if let data, !data.isEmpty {
                        let json = try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
                        if let object = json as? [String: Any], let body = JSTypes.coerceDictionaryToJSObject(object) {
                            reply["body"] = body
                        } else if !(json is NSNull) { throw AuthStorageError.failed }
                    }
                    if let jwt = response.value(forHTTPHeaderField: "set-auth-jwt") { reply["jwt"] = jwt }
                    call.resolve(reply)
                } catch { call.reject("Your sign-in could not be saved securely. Please try again.") }
            }.resume()
        } catch { call.reject("Your saved sign-in could not be opened. Unlock your device and try again.") }
    }
    private enum AuthStorageError: Error { case failed }
}
private final class NoAuthRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Report delivery settings separately from permission: iOS can allow an app
/// while disabling banners or sounds in Settings.
@objc(ReminduhDevicePlugin)
public class ReminduhDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReminduhDevicePlugin"
    public let jsName = "ReminduhDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "notificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareAudioPlayback", returnType: CAPPluginReturnPromise)
    ]
    private func activatePlayback() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
    }
    @objc func prepareAudioPlayback(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { try self.activatePlayback(); call.resolve() }
            catch { call.reject("iPhone audio could not start. Try again after the current call or audio interruption.") }
        }
    }
    @objc func notificationSettings(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "alerts": settings.alertSetting == .enabled,
                "sounds": settings.soundSetting == .enabled,
                "lockScreen": settings.lockScreenSetting == .enabled,
                "notificationCenter": settings.notificationCenterSetting == .enabled
            ])
        }
    }
    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else {
                call.reject("Notification settings could not be opened."); return
            }
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() }
                else { call.reject("Notification settings could not be opened.") }
            }
        }
    }
}
