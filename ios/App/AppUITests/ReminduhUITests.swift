import XCTest
import StoreKitTest

final class ReminduhUITests: XCTestCase {
    func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<12 {
            let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Main navigation")).firstMatch
            let modal = app.otherElements.matching(NSPredicate(format: "label ENDSWITH %@", ", web dialogue")).firstMatch
            let top = modal.exists ? max(60, modal.frame.minY + 8) : 60
            let pageBottom = navigation.exists ? navigation.frame.minY - 8 : app.frame.maxY - 40
            let bottom = modal.exists ? min(pageBottom, modal.frame.maxY - 8) : pageBottom
            if element.exists {
                let frame = element.frame
                // WKWebView can report isHittable for a button covered by the
                // fixed bottom navigation. Require the whole control above it.
                if element.isHittable && frame.minY >= top && frame.maxY <= bottom { return }
                if frame.minY < top || frame.maxY > bottom {
                    // Full-screen swipes can jump past a large-text control in both
                    // directions. Move only the measured overflow, without momentum.
                    let down = frame.minY < top
                    let distance = min(300, down ? top - frame.minY + 28 : frame.maxY - bottom + 28)
                    let startY = down ? top + 30 : bottom - 24
                    let endY = down ? startY + distance : startY - distance
                    let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
                    origin.withOffset(CGVector(dx: 0, dy: startY)).press(
                        forDuration: 0.05,
                        thenDragTo: origin.withOffset(CGVector(dx: 0, dy: endY)),
                        withVelocity: .slow,
                        thenHoldForDuration: 0.15
                    )
                    continue
                }
            }
            app.swipeUp()
        }
        XCTFail("Could not reveal the entire control inside the visible content: " + element.debugDescription + "\n" + app.debugDescription)
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

    private func medicationSnapshot(in app: XCUIApplication) throws -> (labels: [String], name: String, supply: String) {
        app.links["History"].tap()
        let doses = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "mg per tablet"))
        XCTAssertTrue(doses.firstMatch.waitForExistence(timeout: 15), "Dedicated QA medication fixture is required: " + app.debugDescription)
        let labels = doses.allElementsBoundByIndex.map(\.label).sorted()
        let name = try XCTUnwrap(labels.first?.components(separatedBy: ",").first)
        app.links["Medications"].tap()
        let edit = app.links["Edit " + name]
        reveal(edit, in: app); edit.tap()
        let remaining = app.textFields["Scheduled doses remaining"]
        reveal(remaining, in: app)
        let supply = try XCTUnwrap(remaining.value as? String)
        let cancel = app.links["Cancel"]
        reveal(cancel, in: app); cancel.tap()
        return (labels, name, supply)
    }

    private func assertMedicationSnapshot(_ expected: (labels: [String], name: String, supply: String), in app: XCUIApplication) throws {
        let actual = try medicationSnapshot(in: app)
        XCTAssertEqual(actual.labels, expected.labels, "Optional activities must not record or change medication doses")
        XCTAssertEqual(actual.name, expected.name)
        XCTAssertEqual(actual.supply, expected.supply, "Optional activities must not consume medication supply")
    }

    private func openRoomShop(in app: XCUIApplication) {
        app.links["My Blobby"].tap()
        let section = app.buttons["Room"]
        reveal(section, in: app); section.tap()
        let shop = app.links["Decorate →"]
        reveal(shop, in: app); shop.tap()
        XCTAssertTrue(app.buttons["Preview Little bonsai"].waitForExistence(timeout: 15), app.debugDescription)
    }

    func testNativeBackupFilesRestoreRoundTrip() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25), app.debugDescription)
        let baseline = try medicationSnapshot(in: app)
        app.links["My Blobby"].tap()
        let dataSection = app.buttons["Backups & data"]
        reveal(dataSection, in: app); dataSection.tap()
        let export = app.buttons["Export backup"]
        reveal(export, in: app); export.tap()
        let saveToFiles = app.cells["Save to Files"]
        XCTAssertTrue(saveToFiles.waitForExistence(timeout: 10), app.debugDescription)
        saveToFiles.tap()
        attachScreenshot("Native backup Files save destination", from: app)
        let local = app.buttons["On My iPhone"]
        if local.waitForExistence(timeout: 3) { local.tap() }
        let filename = "reminduh-qa-" + String(UUID().uuidString.prefix(8))
        let fileNameField = app.textFields.firstMatch
        XCTAssertTrue(fileNameField.waitForExistence(timeout: 5), app.debugDescription)
        fileNameField.tap()
        fileNameField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (fileNameField.value as? String ?? "").count) + filename)
        let save = app.buttons["Save"]
        XCTAssertTrue(save.exists && save.isEnabled, app.debugDescription)
        save.tap()
        let restore = app.buttons["Restore backup"]
        XCTAssertTrue(restore.waitForExistence(timeout: 10), app.debugDescription)
        reveal(restore, in: app); restore.tap()
        let choose = app.buttons["Choose File"]
        if choose.waitForExistence(timeout: 3) { choose.tap() }
        attachScreenshot("Native backup Files restore picker", from: app)
        let backupFile = app.cells.matching(NSPredicate(format: "label CONTAINS %@", filename)).firstMatch
        XCTAssertTrue(backupFile.waitForExistence(timeout: 10), app.debugDescription)
        backupFile.tap()
        XCTAssertTrue(app.staticTexts["Restore this backup?"].waitForExistence(timeout: 15), app.debugDescription)
        attachScreenshot("Native backup restore confirmation", from: app)
        app.buttons["Replace with backup"].tap()
        XCTAssertTrue(app.staticTexts["Backup restored on this device."].waitForExistence(timeout: 10), app.debugDescription)
        try assertMedicationSnapshot(baseline, in: app)
        app.terminate(); app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25))
        try assertMedicationSnapshot(baseline, in: app)
        app.links["My Blobby"].tap()
        let reminders = app.buttons["Reminders"]
        reveal(reminders, in: app); reminders.tap()
        XCTAssertTrue(app.buttons["Enable reminders"].waitForExistence(timeout: 10), "Restored reminders must remain off until the user enables them again: " + app.debugDescription)
        attachScreenshot("Native restored reminders require opt-in", from: app)
    }

    func testNativeTextScaleAndCoreLayout() throws {
        // Run at the simulator's normal and accessibility Dynamic Type categories.
        // Compare these measured native frames across result bundles; no app hook is used.
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25), app.debugDescription)
        app.links["My Blobby"].tap()
        let names = app.buttons["Names"]
        reveal(names, in: app)
        XCTAssertTrue(names.isHittable, app.debugDescription)
        print("NATIVE_TEXT_METRICS settingsLabelHeight=\(names.frame.height) settingsLabelWidth=\(names.frame.width)")
        XCTAssertGreaterThanOrEqual(names.frame.minX, 0)
        XCTAssertLessThanOrEqual(names.frame.maxX, app.frame.maxX)
        attachScreenshot("Native system text size in settings", from: app)
        let backups = app.buttons["Backups & data"]
        reveal(backups, in: app)
        XCTAssertTrue(backups.isHittable, "Last settings section must remain reachable with larger system text")
        app.links["Medications"].tap()
        app.links["Add medication"].tap()
        let label = app.staticTexts["Medication name"]
        let name = app.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 10), app.debugDescription)
        reveal(name, in: app)
        XCTAssertTrue(name.isHittable)
        XCTAssertGreaterThanOrEqual(name.frame.minY, 60, "Medication name must clear the native status bar")
        print("NATIVE_TEXT_METRICS medicationLabelHeight=\(label.frame.height) medicationFieldHeight=\(name.frame.height)")
        XCTAssertGreaterThanOrEqual(name.frame.minX, 0)
        XCTAssertLessThanOrEqual(name.frame.maxX, app.frame.maxX)
        let tablets = app.textFields["Number of tablets per dose"]
        reveal(tablets, in: app)
        XCTAssertTrue(tablets.isHittable)
        XCTAssertLessThanOrEqual(tablets.frame.maxX, app.frame.maxX)
        attachScreenshot("Native medication form with system text size", from: app)
        let cancel = app.links["Cancel"]
        reveal(cancel, in: app); cancel.tap()
        app.links["Today"].tap()
        let options = app.buttons["Room options"]
        reveal(options, in: app)
        attachScreenshot("Native home room and speech with system text size", from: app)
        let activities = app.buttons["Activities"]
        reveal(activities, in: app)
        XCTAssertTrue(activities.isHittable, "Room actions must remain reachable with larger system text")
        attachScreenshot("Native home speech and controls with system text size", from: app)
    }

    func testNativeRoutineDateTimeFormLayout() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["My Blobby"].waitForExistence(timeout: 25), app.debugDescription)
        let baseline = try medicationSnapshot(in: app)
        app.links["My Blobby"].tap()
        let routines = app.links["Routines"]
        reveal(routines, in: app); routines.tap()
        let template = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Wind down for the night")).firstMatch
        if !template.exists {
            let section = app.buttons["Add routine"]
            reveal(section, in: app); section.tap()
        }
        reveal(template, in: app); template.tap()
        XCTAssertTrue(app.textFields["Routine name"].waitForExistence(timeout: 10), app.debugDescription)
        let dialog = app.otherElements["Add a routine, web dialogue"]
        for label in ["Time (optional)", "Start date"] {
            // WKWebView exposes date/time inputs as Other, in addition to a
            // short label container with the same accessible name.
            let field = try XCTUnwrap(app.otherElements.matching(NSPredicate(format: "label == %@", label))
                .allElementsBoundByIndex.first(where: { $0.frame.height >= 44 }))
            reveal(field, in: app)
            print("NATIVE_ROUTINE_FIELD label=\(label) field=\(field.frame) dialog=\(dialog.frame)")
            XCTAssertGreaterThanOrEqual(field.frame.minX, dialog.frame.minX + 8)
            XCTAssertLessThanOrEqual(field.frame.maxX, dialog.frame.maxX - 8, "Native date/time input must fit inside the dialog")
        }
        attachScreenshot("Native routine date and time fit inside dialog", from: app)
        let time = try XCTUnwrap(app.otherElements.matching(NSPredicate(format: "label == %@", "Time (optional)"))
            .allElementsBoundByIndex.first(where: { $0.frame.height >= 44 }))
        reveal(time, in: app); time.tap()
        XCTAssertTrue(app.datePickers.firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        attachScreenshot("Native routine time picker", from: app)
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5), app.debugDescription)
        done.tap()
        XCTAssertFalse((time.value as? String ?? "").isEmpty, "Native time selection should populate the optional field")
        let date = try XCTUnwrap(app.otherElements.matching(NSPredicate(format: "label == %@", "Start date"))
            .allElementsBoundByIndex.first(where: { $0.frame.height >= 44 }))
        reveal(date, in: app); date.tap()
        XCTAssertTrue(app.datePickers.firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        attachScreenshot("Native routine date picker", from: app)
        XCTAssertTrue(done.waitForExistence(timeout: 5), app.debugDescription)
        done.tap()
        let cancel = app.buttons["Cancel"]
        reveal(cancel, in: app); cancel.tap()
        XCTAssertFalse(dialog.exists)
        try assertMedicationSnapshot(baseline, in: app)
    }

    func testOptionalRoutineActivityAndMedicationIsolation() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["Today"].waitForExistence(timeout: 25), app.debugDescription)
        let baseline = try medicationSnapshot(in: app)
        app.links["My Blobby"].tap()
        let routines = app.links["Routines"]
        reveal(routines, in: app); routines.tap()
        let template = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Wind down for the night")).firstMatch
        if !template.exists {
            let addSection = app.buttons["Add routine"]
            reveal(addSection, in: app); addSection.tap()
        }
        reveal(template, in: app); template.tap()
        let prefix = "QA rest " + String(UUID().uuidString.prefix(6)) + " "
        let nameField = app.textFields["Routine name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 10), app.debugDescription)
        nameField.tap()
        nameField.typeText(prefix)
        let name = try XCTUnwrap(nameField.value as? String)
        XCTAssertTrue(name.contains(prefix), "The routine title must include the typed QA name")
        if app.buttons["Done"].exists { app.buttons["Done"].tap() }
        let submit = app.buttons["Add routine"]
        reveal(submit, in: app)
        attachScreenshot("Native routine form actions reachable inside dialog", from: app)
        submit.tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 10), app.debugDescription)
        // The persistent confirmation can cover the next page's action. Dismiss
        // it explicitly, as a user can, before scrolling to the new routine.
        let dismissMessage = app.buttons["Dismiss message"]
        XCTAssertTrue(dismissMessage.waitForExistence(timeout: 5), app.debugDescription)
        dismissMessage.tap()
        XCTAssertTrue(dismissMessage.waitForNonExistence(timeout: 5))
        app.links["Today"].tap()
        let routine = app.otherElements[name + ", article"].firstMatch
        let start = routine.buttons["Take a break with Blobby"]
        reveal(start, in: app)
        XCTAssertTrue(start.exists, app.debugDescription)
        XCTAssertFalse(app.buttons["Undo " + name].exists, "Starting an activity should require an explicit completion later")
        // Native AX taps may implicitly scroll a WKWebView. Check that the
        // observed target has settled, then tap that visible point once.
        var visibleFrame = start.frame
        var stableSamples = 0
        for _ in 0..<12 {
            Thread.sleep(forTimeInterval: 0.15)
            let nextFrame = start.frame
            stableSamples = abs(nextFrame.minY - visibleFrame.minY) < 1 && abs(nextFrame.minX - visibleFrame.minX) < 1 ? stableSamples + 1 : 0
            visibleFrame = nextFrame
            if stableSamples >= 2 { break }
        }
        XCTAssertGreaterThanOrEqual(stableSamples, 2, "The routine action must settle before its tap")
        let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Main navigation")).firstMatch
        XCTAssertGreaterThanOrEqual(visibleFrame.minY, 60)
        XCTAssertLessThanOrEqual(visibleFrame.maxY, navigation.frame.minY - 8)
        XCTAssertTrue(start.isHittable)
        print("NATIVE_ROUTINE_TAP frame=\(visibleFrame) center=(\(visibleFrame.midX),\(visibleFrame.midY))")
        attachScreenshot("Native routine action visible before one tap", from: app)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: visibleFrame.midX, dy: visibleFrame.midY)).tap()
        XCTAssertTrue(app.staticTexts["A restful moment"].waitForExistence(timeout: 20), app.debugDescription)
        let pause = app.switches["Pause animation"]
        reveal(pause, in: app); pause.tap()
        XCTAssertTrue(app.switches["Resume animation"].waitForExistence(timeout: 5))
        app.switches["Resume animation"].tap()
        attachScreenshot("Native optional rest activity", from: app)
        let finish = app.buttons["Finish break"]
        reveal(finish, in: app); finish.tap()
        XCTAssertTrue(app.staticTexts["How did your routine go?"].waitForExistence(timeout: 10), app.debugDescription)
        let done = app.buttons["Done"]
        done.tap()
        let recorded = app.buttons["Undo " + name]
        XCTAssertTrue(recorded.waitForExistence(timeout: 10), app.debugDescription)
        attachScreenshot("Native routine completed separately from medication", from: app)
        try assertMedicationSnapshot(baseline, in: app)
        app.terminate(); app.launch()
        XCTAssertTrue(app.links["Today"].waitForExistence(timeout: 25))
        app.links["Today"].tap()
        XCTAssertTrue(recorded.waitForExistence(timeout: 15), "Optional routine record must survive process termination")
        try assertMedicationSnapshot(baseline, in: app)
    }

    func testShopClothingFeedingAndZenGarden() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.links["Today"].waitForExistence(timeout: 25), app.debugDescription)
        let baseline = try medicationSnapshot(in: app)
        openRoomShop(in: app)
        let outfits = app.switches["Outfits"]
        reveal(outfits, in: app); outfits.tap()
        let glasses = app.otherElements["Preview Daydreamer, owned"]
        reveal(glasses, in: app); glasses.tap()
        let wear = app.buttons["Wear this outfit"]
        if wear.waitForExistence(timeout: 3) { reveal(wear, in: app); wear.tap() }
        XCTAssertTrue(app.buttons["Wearing now"].waitForExistence(timeout: 10), app.debugDescription)
        attachScreenshot("Native owned outfit equipped from shop", from: app)
        app.buttons["Close item details"].tap()
        app.links["Today"].tap()
        let feed = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Feed ")).firstMatch
        reveal(feed, in: app); feed.tap()
        let snacks = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@ AND enabled == true", "Select "))
        let snack = snacks.firstMatch
        XCTAssertTrue(snack.waitForExistence(timeout: 10), "Dedicated QA pantry needs one available snack: " + app.debugDescription)
        let snackName = snack.label.components(separatedBy: ",")[0].replacingOccurrences(of: "Select ", with: "")
        let countText = snack.label.components(separatedBy: ", ")[1].components(separatedBy: " ")[0]
        let beforeCount = try XCTUnwrap(Int(countText))
        reveal(snack, in: app); snack.tap()
        let give = app.buttons["Feed " + snackName]
        reveal(give, in: app); give.tap()
        let consumed = app.switches["Select " + snackName + ", " + String(beforeCount - 1) + " available"]
        XCTAssertTrue(consumed.waitForExistence(timeout: 15), "Feeding must consume exactly one owned snack: " + app.debugDescription)
        attachScreenshot("Native feeding consumed one snack", from: app)
        let closeTray = app.buttons["Close food tray"]
        reveal(closeTray, in: app); closeTray.tap()
        openRoomShop(in: app)
        let useZen = app.buttons["Use Zen garden in room"]
        let activeZen = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Zen garden is in your room")).firstMatch
        if !activeZen.exists {
            if useZen.exists { reveal(useZen, in: app); useZen.tap() }
            else {
                // Spend only earned/starter virtual leaves on the isolated QA device.
                let buy = app.buttons["Buy and use Zen garden for 60 leaves"]
                reveal(buy, in: app); buy.tap()
                let confirm = app.buttons["Buy & use 60 leaves"]
                XCTAssertTrue(confirm.waitForExistence(timeout: 10), app.debugDescription)
                confirm.tap()
            }
        }
        XCTAssertTrue(activeZen.waitForExistence(timeout: 10), app.debugDescription)
        app.terminate(); app.launch()
        XCTAssertTrue(app.links["Today"].waitForExistence(timeout: 25))
        app.links["My Blobby"].tap()
        let wardrobe = app.buttons["Wardrobe"]
        reveal(wardrobe, in: app); wardrobe.tap()
        XCTAssertEqual(app.switches["Daydreamer"].value as? String, "1", "Owned outfit must survive relaunch")
        app.links["Today"].tap()
        let activities = app.buttons["Activities"]
        reveal(activities, in: app); activities.tap()
        let zen = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "Zen:")).firstMatch
        reveal(zen, in: app); zen.tap()
        let back = app.buttons["Back to room"]
        XCTAssertTrue(back.waitForExistence(timeout: 20), app.debugDescription)
        let sand = app.otherElements["Freeform sand garden"]
        XCTAssertTrue(sand.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertGreaterThan(sand.frame.width, 200)
        XCTAssertGreaterThan(sand.frame.height, 200)
        XCTAssertTrue(back.isHittable)
        let undo = app.buttons["Undo"]
        XCTAssertFalse(undo.isEnabled, "New sand starts without an undo history")
        sand.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.35)).press(forDuration: 0.1, thenDragTo: sand.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.65)))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: undo)
        waitForExpectations(timeout: 10)
        attachScreenshot("Native sand after touch raking", from: app)
        // Sand has no autoplay: leaving the app pauses its gesture/audio safely.
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(sand.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(undo.isEnabled, "Backgrounding must preserve the drawn sand")
        reveal(undo, in: app); undo.tap()
        XCTAssertFalse(undo.isEnabled, "Undo should remove the single native touch stroke")
        app.switches["Smooth"].tap()
        XCTAssertEqual(app.switches["Smooth"].value as? String, "1")
        back.tap()
        XCTAssertTrue(activities.waitForExistence(timeout: 10))
        openRoomShop(in: app)
        let bonsai = app.buttons["Use Little bonsai in room"]
        reveal(bonsai, in: app); bonsai.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Little bonsai is in your room")).firstMatch.waitForExistence(timeout: 10))
        try assertMedicationSnapshot(baseline, in: app)
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
