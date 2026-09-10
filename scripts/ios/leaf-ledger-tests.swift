import Foundation

@main struct LeafLedgerChecks {
    static func main() throws {
        var ledger = LeafLedger()
        try ledger.applyVerifiedTransaction(id: "apple-1", amount: 100, refunded: false)
        try ledger.applyVerifiedTransaction(id: "apple-1", amount: 100, refunded: false)
        precondition(ledger.available == 100, "duplicate transaction cannot grant twice")
        let order = UUID().uuidString
        try ledger.reserve(id: order, product: "outfit.frog", price: 80, earned: 5)
        precondition(ledger.available == 25 && ledger.pending?.paidLeaves == 75)
        try ledger.reserve(id: order, product: "outfit.frog", price: 80, earned: 5)
        precondition(ledger.available == 25, "retry cannot debit twice")
        let restored = try JSONDecoder().decode(LeafLedger.self, from: JSONEncoder().encode(ledger))
        precondition(restored == ledger, "pending delivery survives durable serialization")
        do { try ledger.reserve(id: UUID().uuidString, product: "room.record_player", price: 70, earned: 0); fatalError("parallel order accepted") } catch {}
        do { try ledger.finish(id: UUID().uuidString); fatalError("wrong acknowledgement accepted") } catch {}
        try ledger.applyVerifiedTransaction(id: "apple-1", amount: 100, refunded: true)
        precondition(ledger.available == 0 && ledger.balance == -75)
        try ledger.applyVerifiedTransaction(id: "apple-1", amount: 100, refunded: true)
        precondition(ledger.balance == -75, "refund applies once")
        try ledger.finish(id: order, cancel: true)
        precondition(ledger.balance == 0, "returning a reserved order cannot recreate refunded currency")
        try ledger.applyVerifiedTransaction(id: "apple-1", amount: 100, refunded: false)
        precondition(ledger.balance == 0, "a revoked grant cannot be delivered again")
        try ledger.applyVerifiedTransaction(id: "apple-2", amount: 350, refunded: false)
        let second = UUID().uuidString
        try ledger.reserve(id: second, product: "room.record_player", price: 70, earned: 0)
        try ledger.finish(id: second)
        try ledger.finish(id: second)
        precondition(ledger.balance == 280 && ledger.pending == nil)
        try ledger.applyVerifiedTransaction(id: "apple-2", amount: 350, refunded: true)
        try ledger.applyVerifiedTransaction(id: "apple-3", amount: 100, refunded: false)
        precondition(ledger.available == 30, "new credits settle spent refund debt")
        do { try ledger.reserve(id: UUID().uuidString, product: "room.record_player", price: 70, earned: 0); fatalError("insufficient balance accepted") } catch {}
        let before = ledger
        do { try ledger.applyVerifiedTransaction(id: "", amount: -1, refunded: false); fatalError("invalid credit accepted") } catch {}
        precondition(before == ledger)
        print("15 native leaf ledger checks passed: grants, duplicate delivery, reservations, persistence, cancellation, refunds and recovery.")
    }
}
