import Capacitor
import MusicKit
import Combine

@objc(BlobbyMusicPlugin)
public class BlobbyMusicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BlobbyMusicPlugin"
    public let jsName = "BlobbyMusic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "library", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "control", returnType: CAPPluginReturnPromise)
    ]
    private var observers = Set<AnyCancellable>()
    private var songs: [String: Song] = [:]
    private var playlists: [String: Playlist] = [:]
    private var ownsPlayback = false
    private var enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "ReminduhMusicKitEnabled") as? Bool == true }
    private var connected: Bool { enabled && UserDefaults.standard.bool(forKey: "reminduh.music.connected") && MusicAuthorization.currentStatus == .authorized }
    @MainActor private func state() -> JSObject {
        guard enabled else { return ["available": false, "connected": false, "playing": false] }
        let player = ApplicationMusicPlayer.shared
        if !connected && ownsPlayback {
            ownsPlayback = false; player.stop(); songs.removeAll(); playlists.removeAll()
        }
        let entry = ownsPlayback ? player.queue.currentEntry : nil
        return ["available": true, "connected": connected, "playing": ownsPlayback && player.state.playbackStatus == .playing, "title": entry?.title ?? "", "artist": entry?.subtitle ?? "", "artwork": entry?.artwork?.url(width: 320, height: 320)?.absoluteString ?? ""]
    }
    @MainActor private func observePlayer() {
        guard observers.isEmpty else { return }
        let player = ApplicationMusicPlayer.shared
        Publishers.Merge(player.state.objectWillChange.map { _ in () }, player.queue.objectWillChange.map { _ in () })
            .sink { [weak self] _ in
                DispatchQueue.main.async { guard let self else { return }; self.notifyListeners("musicChanged", data: self.state()) }
            }.store(in: &observers)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification).sink { [weak self] _ in
            Task { @MainActor in if self?.ownsPlayback == true { ApplicationMusicPlayer.shared.pause() } }
        }.store(in: &observers)
    }
    @objc func getStatus(_ call: CAPPluginCall) { Task { @MainActor in call.resolve(state()) } }
    @objc func connect(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard enabled else { call.reject("Apple Music will be available after this iPhone build is connected to Apple’s music service."); return }
            guard await MusicAuthorization.request() == .authorized else { call.reject("Apple Music access wasn’t enabled. You can keep listening to Blobby radio."); return }
            do {
                guard try await MusicSubscription.current.canPlayCatalogContent else { call.reject("An active Apple Music subscription is needed to stream your library."); return }
                UserDefaults.standard.set(true, forKey: "reminduh.music.connected")
                observePlayer()
                call.resolve(state())
            } catch { call.reject("Apple Music couldn’t connect. Please try again when you’re online.") }
        }
    }
    @objc func disconnect(_ call: CAPPluginCall) {
        Task { @MainActor in
            if ownsPlayback { ApplicationMusicPlayer.shared.stop(); ApplicationMusicPlayer.shared.queue = [] }
            ownsPlayback = false
            songs.removeAll(); playlists.removeAll(); observers.removeAll()
            UserDefaults.standard.set(false, forKey: "reminduh.music.connected")
            notifyListeners("musicChanged", data: state())
            call.resolve(state())
        }
    }
    @objc func library(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard connected else { call.reject("Connect Apple Music first."); return }
            let offset = max(0, min(10000, call.getInt("offset") ?? 0))
            let query = String((call.getString("query") ?? "").prefix(100))
            do {
                if call.getString("kind") == "playlists" {
                    var request = MusicLibraryRequest<Playlist>()
                    request.limit = 25; request.offset = offset
                    if !query.isEmpty { request.filter(text: query) }
                    let items = try await request.response().items
                    guard connected else { call.reject("Apple Music was disconnected."); return }
                    if offset == 0 { playlists.removeAll() }
                    for item in items { playlists[item.id.rawValue] = item }
                    call.resolve(["items": items.map { ["id": $0.id.rawValue, "kind": "playlist", "title": $0.name, "artist": $0.curatorName ?? "Your playlist", "artwork": $0.artwork?.url(width: 160, height: 160)?.absoluteString ?? ""] as JSObject }, "hasMore": items.count == 25])
                } else {
                    var request = MusicLibraryRequest<Song>()
                    request.limit = 25; request.offset = offset
                    if !query.isEmpty { request.filter(text: query) }
                    let items = try await request.response().items
                    guard connected else { call.reject("Apple Music was disconnected."); return }
                    if offset == 0 { songs.removeAll() }
                    for item in items { songs[item.id.rawValue] = item }
                    call.resolve(["items": items.map { ["id": $0.id.rawValue, "kind": "song", "title": $0.title, "artist": $0.artistName, "artwork": $0.artwork?.url(width: 160, height: 160)?.absoluteString ?? ""] as JSObject }, "hasMore": items.count == 25])
                }
            } catch { call.reject("Your music library couldn’t load. Please try again.") }
        }
    }
    @objc func play(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard connected, let id = call.getString("id") else { call.reject("Connect Apple Music and choose a song."); return }
            do {
                let player = ApplicationMusicPlayer.shared
                if call.getString("kind") == "playlist", let playlist = playlists[id] { player.queue = .init(for: [playlist]) }
                else if let song = songs[id] { player.queue = .init(for: [song]) }
                else { call.reject("Please choose this music from your library again."); return }
                observePlayer()
                ownsPlayback = true
                try await player.play()
                call.resolve(state())
            } catch { call.reject("This music couldn’t play. Check your connection and Apple Music subscription.") }
        }
    }
    @objc func control(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard connected, ownsPlayback else { call.resolve(state()); return }
            do {
                let player = ApplicationMusicPlayer.shared
                switch call.getString("action") {
                case "play": try await player.play()
                case "pause": player.pause()
                case "next": try await player.skipToNextEntry()
                case "previous": try await player.skipToPreviousEntry()
                default: break
                }
                call.resolve(state())
            } catch { call.reject("Playback couldn’t continue. Please choose music again.") }
        }
    }
}
