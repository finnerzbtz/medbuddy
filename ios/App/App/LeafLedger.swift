import Foundation

struct LeafReservation: Codable, Equatable {
    let id: String
    let productId: String
    let paidLeaves: Int
    let earnedLeaves: Int
}
struct LeafLedger: Codable, Equatable {
    // A refund can leave debt after spending; future credits settle it before becoming available.
    var balance = 0
    var grants: [String: Int] = [:]
    var revoked: Set<String> = []
    var pending: LeafReservation?
    var available: Int { max(0, balance) }
    private func failure(_ message: String) -> NSError {
        NSError(domain: "ReminduhLeaves", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    mutating func applyVerifiedTransaction(id: String, amount: Int, refunded: Bool) throws {
        guard !id.isEmpty, amount > 0, amount <= 800 else { throw failure("This leaf transaction isn’t valid.") }
        if refunded {
            if !revoked.contains(id) {
                if let credited = grants[id] { balance -= credited }
                revoked.insert(id)
            }
        } else if grants[id] == nil && !revoked.contains(id) {
            guard balance <= 9_000_000_000_000_000 - amount else { throw failure("Your leaf wallet is full.") }
            grants[id] = amount
            balance += amount
        }
    }
    mutating func reserve(id: String, product: String, price: Int, earned: Int) throws {
        guard UUID(uuidString: id) != nil, !product.isEmpty, price > 0, earned >= 0, earned < price else { throw failure("This shop order isn’t valid.") }
        let order = LeafReservation(id: id, productId: product, paidLeaves: price - earned, earnedLeaves: earned)
        if let pending {
            guard pending == order else { throw failure("Your previous leaf purchase is still finishing. Please try again.") }
        } else {
            guard order.paidLeaves <= available else { throw failure("There aren’t enough leaves for this item.") }
            balance -= order.paidLeaves
            pending = order
        }
    }
    mutating func finish(id: String, cancel: Bool = false) throws {
        guard let order = pending else { return }
        guard order.id == id else { throw failure("The leaf order doesn’t match.") }
        if cancel { balance += order.paidLeaves }
        pending = nil
    }
}
