import XCTest
import StoreKitTest

final class ReminduhUITests: XCTestCase {
    func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<12 {
            if element.isHittable { return }
            app.swipeUp()
        }
    }
    func testOnboardingRemindersAndPersistence() throws {
        let app = XCUIApplication()
        app.launch()
        let welcome = app.buttons["Make yourself at home"]
        if welcome.waitForExistence(timeout: 8) {
        reveal(welcome, in: app)
        welcome.tap()
        let cancel = app.links["I’ll do this later"]
        // Onboarding offers a medication form; use its existing skip action for this smoke test.
        let later = app.links.matching(NSPredicate(format: "label CONTAINS[c] 'later'")).firstMatch
        if later.waitForExistence(timeout: 10) { reveal(later, in: app); later.tap() }
        else {
            let fallback = app.links["Cancel"]
            reveal(fallback, in: app)
            XCTAssertTrue(fallback.exists, app.debugDescription)
            fallback.tap()
        }
        _ = cancel
        }
        let profile = app.links["My Blobby"]
        XCTAssertTrue(profile.waitForExistence(timeout: 20), app.debugDescription)
        profile.tap()
        let reminderSection = app.buttons["Reminders"]
        if reminderSection.waitForExistence(timeout: 10) { reminderSection.tap() }
        let enable = app.buttons["Enable reminders"]
        if enable.waitForExistence(timeout: 3) {
            reveal(enable, in: app)
            enable.tap()
        }
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"]
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        let test = app.buttons["Test notification"]
        XCTAssertTrue(test.waitForExistence(timeout: 15), app.debugDescription)
        test.tap()
        XCUIDevice.shared.press(.home)
        let notification = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Your device reminders are working.")).firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 15), "Expected a real iOS reminder after leaving the app: " + springboard.debugDescription)
        let notificationShot = XCTAttachment(screenshot: springboard.screenshot())
        notificationShot.name = "Reminder delivered with app closed"
        notificationShot.lifetime = .keepAlways
        add(notificationShot)
        app.activate()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Native reminder settings"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.terminate()
        app.launch()
        XCTAssertTrue(profile.waitForExistence(timeout: 30), app.debugDescription)
        XCTAssertFalse(welcome.exists, "Onboarding should survive process termination")
        let roomShot = XCTAttachment(screenshot: app.screenshot())
        roomShot.name = "Blobby room after native relaunch"
        roomShot.lifetime = .keepAlways
        add(roomShot)
        profile.tap()
        if reminderSection.waitForExistence(timeout: 10) { reminderSection.tap() }
        XCTAssertTrue(test.waitForExistence(timeout: 20), "Notification opt-in should survive relaunch")
        let dataSection = app.buttons["Backups & data"]
        reveal(dataSection, in: app)
        dataSection.tap()
        let backup = app.buttons["Export backup"]
        reveal(backup, in: app)
        backup.tap()
        XCTAssertTrue(app.buttons["Copy"].waitForExistence(timeout: 10) || app.otherElements["ActivityListView"].exists || app.buttons["Save to Files"].exists, app.debugDescription)
        let exportShot = XCTAttachment(screenshot: app.screenshot())
        exportShot.name = "Native backup share sheet"
        exportShot.lifetime = .keepAlways
        add(exportShot)
    }
    func testNotificationOnboarding() throws {
        // Run on a fresh simulator to exercise Apple's first permission prompt.
        let app = XCUIApplication()
        app.launch()
        let welcome = app.buttons["Make yourself at home"]
        guard welcome.waitForExistence(timeout: 15) else {
            throw XCTSkip("This test requires a fresh simulator install.")
        }
        reveal(welcome, in: app); welcome.tap()
        let later = app.links["I’ll add this later"]
        XCTAssertTrue(later.waitForExistence(timeout: 10), app.debugDescription)
        reveal(later, in: app); later.tap()
        let allowNotifications = app.buttons["Allow notifications"]
        XCTAssertTrue(allowNotifications.waitForExistence(timeout: 10), app.debugDescription)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCTAssertFalse(springboard.buttons["Allow"].exists, "No system prompt before choosing Allow notifications")
        let before = XCTAttachment(screenshot: app.screenshot())
        before.name = "Optional notification onboarding"; before.lifetime = .keepAlways; add(before)
        reveal(allowNotifications, in: app); allowNotifications.tap()
        let allow = springboard.buttons["Allow"]
        XCTAssertTrue(allow.waitForExistence(timeout: 10), "Expected Apple's real notification permission prompt")
        let prompt = XCTAttachment(screenshot: springboard.screenshot())
        prompt.name = "Apple notification permission prompt"; prompt.lifetime = .keepAlways; add(prompt)
        allow.tap()
        let done = app.links["Go to Blobby"]
        XCTAssertTrue(done.waitForExistence(timeout: 15), app.debugDescription)
        let test = app.buttons["Test notification"]
        reveal(test, in: app); test.tap()
        XCUIDevice.shared.press(.home)
        let notification = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Your device reminders are working.")).firstMatch
        XCTAssertTrue(notification.waitForExistence(timeout: 18), springboard.debugDescription)
        let delivered = XCTAttachment(screenshot: springboard.screenshot())
        delivered.name = "Onboarding reminder delivered with app closed"; delivered.lifetime = .keepAlways; add(delivered)
        app.activate(); done.tap()
        app.terminate(); app.launch()
        let profile = app.links["My Blobby"]
        XCTAssertTrue(profile.waitForExistence(timeout: 20), app.debugDescription)
        profile.tap()
        let reminderSection = app.buttons["Reminders"]
        if reminderSection.waitForExistence(timeout: 10) { reminderSection.tap() }
        XCTAssertTrue(app.buttons["Turn off reminders"].waitForExistence(timeout: 15), "Reminder choice should survive native relaunch")
    }

    @MainActor func testNativeLeafPurchases() async throws {
        guard ProcessInfo.processInfo.environment["REMINDUH_STOREKIT_TESTS"] == "1" else { throw XCTSkip("Use the Reminduh StoreKit scheme for simulated purchases.") }
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Reminduh", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        session.disableDialogs = true
        session.clearTransactions()
        let app = XCUIApplication()
        app.launchArguments = ["--leaf-test-wallet=" + UUID().uuidString]
        app.launch()
        let welcome = app.buttons["Make yourself at home"]
        if welcome.waitForExistence(timeout: 8) {
            reveal(welcome, in: app); welcome.tap()
            let later = app.links.matching(NSPredicate(format: "label CONTAINS[c] 'later'")).firstMatch
            if later.waitForExistence(timeout: 10) { reveal(later, in: app); later.tap() }
            else { let cancel = app.links["Cancel"]; reveal(cancel, in: app); cancel.tap() }
        }
        let wallet = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Open leaf wallet")).firstMatch
        XCTAssertTrue(wallet.waitForExistence(timeout: 30), app.debugDescription)
        let initial = Int(wallet.label.split(separator: " ").first ?? "") ?? -1
        XCTAssertGreaterThanOrEqual(initial, 0)
        _ = try await session.buyProduct(identifier: "com.reminduh.leaves.100")
        let credited = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "\(initial + 100) leaves available. Open leaf wallet")).firstMatch
        XCTAssertTrue(credited.waitForExistence(timeout: 25), app.debugDescription)
        app.terminate(); app.launch()
        XCTAssertTrue(credited.waitForExistence(timeout: 25), "A relaunch must preserve credit without duplicating it")
        reveal(credited, in: app); credited.tap()
        let pack = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Buy 350 leaves for")).firstMatch
        XCTAssertTrue(pack.waitForExistence(timeout: 15), app.debugDescription)
        reveal(pack, in: app); pack.tap()
        let close = app.buttons["Close leaf wallet"]
        XCTAssertTrue(close.waitForExistence(timeout: 15)); close.tap()
        let twice = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "\(initial + 450) leaves available. Open leaf wallet")).firstMatch
        XCTAssertTrue(twice.waitForExistence(timeout: 25), "The real native product.purchase path should deliver its simulated pack")
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "StoreKit simulated leaves credited"; shot.lifetime = .keepAlways; add(shot)
    }

}
