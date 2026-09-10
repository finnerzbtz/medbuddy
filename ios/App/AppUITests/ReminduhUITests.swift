import XCTest
import StoreKitTest

final class ReminduhUITests: XCTestCase {
    func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<12 {
            let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Main navigation")).firstMatch
            let bottom = navigation.exists ? navigation.frame.minY - 8 : app.frame.maxY - 40
            if element.exists {
                let frame = element.frame
                // WKWebView can report isHittable for a button covered by the
                // fixed bottom navigation. Require the whole control above it.
                if element.isHittable && frame.minY >= 60 && frame.maxY <= bottom { return }
                if frame.minY < 60 { app.swipeDown(); continue }
            }
            app.swipeUp()
        }
    }
    private func checkbox(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let checkbox = app.checkBoxes[label]
        if checkbox.exists { return checkbox }
        return app.switches[label]
    }

    private func setCheckbox(_ label: String, enabled: Bool, in app: XCUIApplication) {
        let control = checkbox(label, in: app)
        XCTAssertTrue(control.waitForExistence(timeout: 10), app.debugDescription)
        reveal(control, in: app)
        let value = control.value as? String
        let checked = value == "1" || value == "true"
        if checked != enabled { control.tap() }
        let expected = NSPredicate(format: "value == %@ OR value == %@", enabled ? "1" : "0", enabled ? "true" : "false")
        expectation(for: expected, evaluatedWith: control)
        waitForExpectations(timeout: 10)
    }

    private func attachScreenshot(_ name: String, from app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testRecordedVoiceAndSoundPreferences() throws {
        // Use only a dedicated, already-onboarded QA simulator; no health data is edited.
        let app = XCUIApplication()
        app.launch()
        let profile = app.links["My Blobby"]
        guard profile.waitForExistence(timeout: 25) else {
            throw XCTSkip("Complete onboarding on the dedicated QA simulator before this audio test.")
        }
        profile.tap()
        let soundSettings = app.buttons["Sound settings"]
        XCTAssertTrue(soundSettings.waitForExistence(timeout: 10), app.debugDescription)
        soundSettings.tap()
        setCheckbox("Enable audio", enabled: true, in: app)
        setCheckbox("Background music", enabled: false, in: app)
        let preview = app.buttons["Preview Cloud voice"]
        reveal(preview, in: app)
        XCTAssertTrue(preview.isHittable, app.debugDescription)
        preview.tap()
        let stop = app.buttons["Stop Cloud voice"]
        XCTAssertTrue(stop.waitForExistence(timeout: 10), app.debugDescription)
        // The Stop button also appears while fetching. Require decoding to finish,
        // with the recorded clip still playing, rather than mistaking loading for success.
        let loading = app.staticTexts["Loading voice…"]
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: loading)
        waitForExpectations(timeout: 15)
        XCTAssertFalse(app.staticTexts["The voice couldn’t play. Please try again."].exists, app.debugDescription)
        XCTAssertTrue(stop.exists, "Recorded voice should be playing after loading completes: " + app.debugDescription)
        attachScreenshot("Recorded Cloud voice playing in native WKWebView", from: app)
        stop.tap()
        XCTAssertTrue(preview.waitForExistence(timeout: 5))

        // A real foreground transition should permit the next recorded preview.
        XCUIDevice.shared.press(.home)
        app.activate()
        reveal(preview, in: app)
        preview.tap()
        XCTAssertTrue(stop.waitForExistence(timeout: 10), app.debugDescription)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: loading)
        waitForExpectations(timeout: 15)
        XCTAssertTrue(stop.exists, "Voice should recover after returning to the app")
        stop.tap()

        // The user's mute choice must survive process termination and a normal update.
        setCheckbox("Enable audio", enabled: false, in: app)
        app.terminate()
        app.launch()
        XCTAssertTrue(profile.waitForExistence(timeout: 25))
        soundSettings.tap()
        let master = checkbox("Enable audio", in: app)
        XCTAssertTrue(master.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(master.value as? String, "0", "Master mute should survive native relaunch")
        attachScreenshot("Muted sound preferences survive native relaunch", from: app)
        app.buttons["Close sound settings"].tap()
    }

    func testRadioPlaybackAndForegroundRecovery() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25), app.debugDescription)
        app.buttons["Sound settings"].tap()
        setCheckbox("Background music", enabled: false, in: app)
        let player = app.links["Open record player"]
        reveal(player, in: app)
        player.tap()
        let play = app.buttons["Play Blobby radio"]
        XCTAssertTrue(play.waitForExistence(timeout: 15), app.debugDescription)
        reveal(play, in: app)
        play.tap()
        // This status follows a started AudioBufferSource, not the saved music switch.
        XCTAssertTrue(app.staticTexts["Playing"].waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertFalse(app.buttons["Retry music"].exists)
        attachScreenshot("Bundled radio recording playing in native WKWebView", from: app)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["Playing"].waitForExistence(timeout: 20), "Radio should recover after the app returns")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25))
        app.buttons["Sound settings"].tap()
        XCTAssertEqual(checkbox("Enable audio", in: app).value as? String, "1")
        XCTAssertEqual(checkbox("Background music", in: app).value as? String, "1")
        setCheckbox("Enable audio", enabled: false, in: app)
        app.buttons["Close sound settings"].tap()
    }

    func testMedicationRecordSupplyAndRelaunch() throws {
        // This is synthetic QA data, retained for an in-place update check.
        let app = XCUIApplication()
        let name = "QA sample " + String(UUID().uuidString.prefix(6))
        app.launch()
        let medications = app.links["Medications"]
        XCTAssertTrue(medications.waitForExistence(timeout: 25), app.debugDescription)
        medications.tap()
        app.links["Add medication"].tap()
        let nameField = app.textFields.firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 10), app.debugDescription)
        nameField.tap(); nameField.typeText(name)
        let strength = app.textFields["Strength per tablet (mg)"]
        reveal(strength, in: app); strength.tap(); strength.typeText("10")
        let tablets = app.textFields["Number of tablets per dose"]
        reveal(tablets, in: app); tablets.tap(); tablets.typeText("2")
        let keyboardDone = app.buttons["Done"]
        if keyboardDone.exists { keyboardDone.tap() }
        let supply = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Track remaining supply")).firstMatch
        reveal(supply, in: app)
        XCTAssertTrue(supply.exists, app.debugDescription)
        if supply.value as? String != "1" { supply.tap() }
        let add = app.buttons["Add medication"]
        reveal(add, in: app); add.tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15), app.debugDescription)
        app.links["History"].tap()
        let dose = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name + ",")).firstMatch
        XCTAssertTrue(dose.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(dose.label.contains("2 tablets") && dose.label.contains("10 mg"), dose.label)
        reveal(dose, in: app); dose.tap()
        XCTAssertTrue(app.staticTexts["Record your dose"].waitForExistence(timeout: 10))
        let confirm = app.buttons["I’ve taken this dose"]
        reveal(confirm, in: app); confirm.tap()
        let taken = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label ENDSWITH %@", name + ",", "Taken")).firstMatch
        XCTAssertTrue(taken.waitForExistence(timeout: 15), app.debugDescription)
        attachScreenshot("Synthetic medication recorded in native History", from: app)
        app.terminate(); app.launch()
        XCTAssertTrue(app.links["History"].waitForExistence(timeout: 25))
        app.links["History"].tap()
        XCTAssertTrue(taken.waitForExistence(timeout: 15), "Recorded dose should survive process termination")
        medications.tap()
        let edit = app.links["Edit " + name]
        reveal(edit, in: app); edit.tap()
        let remaining = app.textFields["Scheduled doses remaining"]
        reveal(remaining, in: app)
        XCTAssertEqual(remaining.value as? String, "29", "A two-tablet dose consumes one complete scheduled dose of supply")
        attachScreenshot("Scheduled-dose supply after native relaunch", from: app)
        let cancel = app.links["Cancel"]
        reveal(cancel, in: app); cancel.tap()
    }

    func testSensoryGardenEntryAndExit() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["Today"].waitForExistence(timeout: 25), app.debugDescription)
        app.links["Today"].tap()
        let activities = app.buttons["Activities"]
        reveal(activities, in: app)
        XCTAssertTrue(activities.exists, app.debugDescription)
        activities.tap()
        let garden = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Garden:")).firstMatch
        reveal(garden, in: app)
        XCTAssertTrue(garden.exists, "QA room should retain its default bonsai: " + app.debugDescription)
        garden.tap()
        let back = app.buttons["Back to room"]
        XCTAssertTrue(back.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(back.isHittable, "The sensory overlay must keep its close action on screen")
        let canvas = app.images["Interactive bonsai tree"]
        XCTAssertTrue(canvas.exists, app.debugDescription)
        XCTAssertGreaterThan(canvas.frame.width, 100)
        XCTAssertGreaterThan(canvas.frame.height, 100)
        let start = canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.4))
        let end = canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5))
        start.press(forDuration: 0.15, thenDragTo: end)
        app.buttons["Pause garden"].tap()
        XCTAssertTrue(app.buttons["Resume garden"].waitForExistence(timeout: 5))
        app.buttons["Resume garden"].tap()
        attachScreenshot("Native sensory bonsai after touch interaction", from: app)
        back.tap()
        XCTAssertTrue(activities.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(back.exists)
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
        let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Main navigation")).firstMatch
        XCTAssertLessThan(backup.frame.maxY, navigation.frame.minY, "Export must be above the fixed navigation before tapping")
        attachScreenshot("Native backup export control clear of navigation", from: app)
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
