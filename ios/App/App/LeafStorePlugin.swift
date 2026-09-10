import Capacitor
import StoreKit
import Security

/// Purchased currency is device-owned, outside editable web data and app backups.
@objc(LeafStorePlugin)
public class LeafStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LeafStorePlugin"
    public let jsName = "LeafStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getWallet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reserveSpend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSpend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishSpend", returnType: CAPPluginReturnPromise)
    ]
    private let packs = ["com.reminduh.leaves.100": 100, "com.reminduh.leaves.350": 350, "com.reminduh.leaves.800": 800]
    private var observer: Task<Void, Never>?
    private var purchasing = false
    private var purchasesEnabled: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains(where: { $0.hasPrefix("--leaf-test-wallet=") }) { return true }
        #endif
        return Bundle.main.object(forInfoDictionaryKey: "ReminduhLeafPurchasesEnabled") as? Bool == true
    }
    private var walletNamespace: String {
        #if DEBUG
        if let argument = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--leaf-test-wallet=") }) {
            return ".xcode." + String(argument.dropFirst("--leaf-test-wallet=".count))
        }
        #endif
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" ? ".sandbox" : ".production"
    }
    private var key: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "reminduh.purchased-leaves.v1" + walletNamespace, kSecAttrAccount as String: "wallet"] }
    private func readLedger() throws -> LeafLedger {
        var query = key
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return LeafLedger() }
        guard status == errSecSuccess, let bytes = result as? Data else { throw failure("Your leaf wallet couldn’t be opened. Please try again.") }
        return try JSONDecoder().decode(LeafLedger.self, from: bytes)
    }
    private func save(_ ledger: LeafLedger) throws {
        let bytes = try JSONEncoder().encode(ledger)
        let status = SecItemUpdate(key as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
        if status == errSecItemNotFound {
            var item = key
            item[kSecValueData as String] = bytes
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw failure("Your leaf wallet couldn’t be saved. Your purchase will be retried when storage is available.") }
        } else if status != errSecSuccess { throw failure("Your leaf wallet couldn’t be saved. Please try again.") }
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "ReminduhLeaves", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    private func snapshot(_ ledger: LeafLedger) -> JSObject {
        var result: JSObject = ["balance": ledger.available]
        if let p = ledger.pending { result["pending"] = ["id": p.id, "productId": p.productId, "paidLeaves": p.paidLeaves, "earnedLeaves": p.earnedLeaves] }
        return result
    }
    @MainActor private func deliver(_ verified: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = verified, let amount = packs[transaction.productID], transaction.productType == .consumable else { throw failure("Apple couldn’t verify this purchase. No leaves have been added.") }
        var ledger = try readLedger()
        let id = String(transaction.id)
        try ledger.applyVerifiedTransaction(id: id, amount: amount, refunded: transaction.revocationDate != nil)
        try save(ledger)
        // Durable credit and deduplication precede acknowledgement to Apple.
        await transaction.finish()
        notifyListeners("walletChanged", data: snapshot(try readLedger()))
    }
    public override func load() {
        observer = Task { @MainActor [weak self] in
            for await transaction in StoreKit.Transaction.updates {
                guard let self else { return }
                do { try await self.deliver(transaction) }
                catch { self.notifyListeners("walletError", data: ["message": error.localizedDescription]) }
            }
        }
    }
    deinit { observer?.cancel() }
    @objc func getWallet(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                for await transaction in StoreKit.Transaction.unfinished { try await deliver(transaction) }
                call.resolve(snapshot(try readLedger()))
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func getProducts(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard purchasesEnabled else { call.resolve(["products": []]); return }
            do {
                let products = try await Product.products(for: Array(packs.keys))
                call.resolve(["products": products.filter { $0.type == .consumable }.map { ["id": $0.id, "leaves": packs[$0.id]!, "price": $0.displayPrice] as JSObject }])
            } catch { call.reject("The App Store couldn’t load leaf packs. Please try again when you’re online.") }
        }
    }
    @objc func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard purchasesEnabled else { call.reject("Leaf purchases are coming soon."); return }
            guard !purchasing else { call.reject("A purchase is already open."); return }
            guard let id = call.getString("productId"), packs[id] != nil else { call.reject("Choose a leaf pack from the shop."); return }
            purchasing = true
            defer { purchasing = false }
            do {
                guard let product = try await Product.products(for: [id]).first, product.type == .consumable else { throw failure("This leaf pack isn’t available yet.") }
                switch try await product.purchase() {
                case .success(let transaction):
                    try await deliver(transaction)
                    call.resolve(["status": "purchased", "wallet": snapshot(try readLedger())])
                case .pending: call.resolve(["status": "pending"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.resolve(["status": "pending"])
                }
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func reserveSpend(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let id = call.getString("orderId"), UUID(uuidString: id) != nil,
                      let product = call.getString("productId"), let earned = call.getInt("earnedLeaves"), earned >= 0,
                      let url = Bundle.main.url(forResource: "LeafShopCatalog", withExtension: "json"),
                      let catalog = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Int],
                      let price = catalog[product], earned < price else { throw failure("This shop order isn’t valid.") }
                var ledger = try readLedger()
                try ledger.reserve(id: id, product: product, price: price, earned: earned)
                try save(ledger)
                call.resolve(snapshot(ledger))
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func cancelSpend(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                var ledger = try readLedger()
                try ledger.finish(id: call.getString("orderId") ?? "", cancel: true)
                try save(ledger)
                call.resolve(snapshot(ledger))
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func finishSpend(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                var ledger = try readLedger()
                try ledger.finish(id: call.getString("orderId") ?? "", cancel: false)
                try save(ledger)
                call.resolve(snapshot(ledger))
            } catch { call.reject(error.localizedDescription) }
        }
    }
}
