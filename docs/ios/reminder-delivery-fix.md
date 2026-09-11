# Preserve medication alerts at their due time

A working ten-second test notification confirms permission and delivery at the
time of the test. It does not prove that a scheduled medication request existed
at its due time or establish the phone's earlier Focus or notification-summary state.

Two defects were reproduced with the actual scheduler and a controlled clock:

- An 08:00 request still in the OS pending queue at 08:00:00.100 was cancelled by
  a refresh. The future-only planner excluded it and cleanup treated it as obsolete.
- A delivered alert for the current snooze time was removed because cleanup treated
  the presence of any snooze value as evidence that the alert was stale.

Existing due requests now remain with iOS while their original time and at least
one medication in the group remain valid. They are not submitted again, and opening
the app after a missed time does not create a new catch-up notification. Recording,
pausing, archiving, deleting, changing the scheduled time, snoozing, disabling
reminders or denying permission still withdraws the affected request. Retained
requests share the 60-dose-alert budget with future requests; renewal and test
alerts retain their separate slots.

Delivered alerts use the same dose/time relevance check. This preserves the alert
at the current snooze time, removes the superseded alert, and evaluates a medication's
current schedule rather than a future revision when checking whether it is paused.

The change uses existing notification metadata and saved medication data. No schema,
backup, native-persistence or cloud-protocol migration is needed. Medication records,
supply, optional self-care and default sadness are unchanged. This local patch is
not part of distributed TestFlight 0.1.0 (4).

## Validation

Focused tests exercise the exact due-time boundary and the following refresh,
delivery without rescheduling, no catch-up for an empty queue, valid cancellation,
simultaneous medications, snooze replacement and the total OS queue budget.
All 29 native reminder/persistence checks passed. The release gate also passed:
22 Release A contracts, five cloud-version checks, 98 domain checks, repository
hygiene, asset validation, TypeScript and the production/offline build.

The dedicated iOS QA simulator passed `testScheduledMedicationNotificationTap`:
one test, zero failures, 128.475 seconds. It created a synthetic medication through
the form, received its actual scheduled alert in the background, tapped it to open
Today's check-ins, and verified that the dose remained unrecorded and supply was
unchanged. Delivery and destination screenshots were reviewed. All 165 web files
match the native package, with cloud endpoints blank. No user medication data was
used and no TestFlight upload was performed.

Physical iPhone confirmation remains pending. When investigating a missed alert,
check the installed app's reminder status, next alert and schedule setup time. A
working test does not rule out a scheduled Sleep/Focus mode or Scheduled Summary;
[Apple documents those delivery controls](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios).
