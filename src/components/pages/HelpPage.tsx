import { SELF_CARE_RESOURCES } from '@/domain/wisdom';
import { isNative } from '@/native/platform';
import { Link } from 'react-router-dom';
import DisplaySettings from '@/components/app/DisplaySettings';
export default function HelpPage() {
  return (
    <div className="help-page stack">
      <div className="page-heading">
        <h1>Help & accessibility</h1>
      </div>
      <section className="panel" id="comfort" tabIndex={-1}>
        <h2>Make it comfortable</h2>
        <DisplaySettings />
      </section>
      <section className="panel">
        <h2>Using Reminduh</h2>
        <ol>
          <li>Add your medication using the dose and schedule on your instructions.</li>
          <li>On Today, choose a dose or “Check in now” beside Blobby.</li>
          <li>
            Record what you have already done: taken or skipped. You can correct it in History.
          </li>
        </ol>
        <p>
          “Not recorded” means a check-in is missing. It does not tell us whether you took a dose.
          Blobby’s mood is part of the game, not a measure of your health or effort.
        </p>
        <p>
          For advice about a missed dose, follow your medication instructions or ask a pharmacist.
        </p>
        <h3>Reminders</h3>
        <p>
          {isNative
            ? 'Allow notifications in Reminder settings for alerts while Reminduh is closed. Open the app regularly to refresh upcoming alerts, and after changing time zone. Check that a test notification appears on your iPhone; Focus and notification settings may silence it.'
            : 'Browser alerts need permission and Reminduh to stay open. For reminders when it is closed, export your schedule to a calendar and set alerts there. Check that alerts work on your device.'}
        </p>
        <Link className="text-link" to="/profile#reminders">
          Reminder settings
        </Link>
      </section>
      <section className="panel">
        <h2>Little thoughts</h2>
        <p>
          Blobby shares optional self-care ideas and quotes in a speech bubble. They change about
          once a minute. Choose a voice and use Unmute to hear each thought as it appears, or Mute
          for just the words. The timer pauses while Blobby speaks, the bubble is out of view or a
          dialog is open. Hide little thoughts with the × on the bubble, or switch them off in
          Comfort settings below.
        </p>
        <p>
          These are general reflections, not personalised mental health advice. They are chosen
          independently of your medication and check-ins. Quotes include their author, edition and a
          link to the original source. The thoughts work offline; source links need internet.
        </p>
        <p>For more on everyday wellbeing and sensory comfort:</p>
        <ul>
          {SELF_CARE_RESOURCES.map((resource) => (
            <li key={resource.url}>
              <a href={resource.url} target="_blank" rel="noopener noreferrer">
                {resource.title}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Keyboard and screen readers</h2>
        <p>
          Use Tab and Shift + Tab to move, Enter to open links, and Enter or Space for buttons.
          Escape closes a dialog. Dialogs return focus to the control that opened them.
        </p>
        <p>
          Every room activity has a labelled button. You do not need to interact with the 3D
          picture. In History, use the arrow keys to move between dates, then Enter to choose one.
        </p>
        <p>
          You can zoom your browser and use your device’s text, contrast and motion settings. Games
          are optional and never required to record medication.
        </p>
      </section>
      <section className="panel">
        <h2>Your privacy</h2>
        <p>
          Medication details and check-ins are saved on this device. Optional accounts use your
          email for sign-in. If you turn on cloud sync, your medication records, profile,
          preferences and earned Blobby progress are also stored with Neon in London, using
          encrypted connections and account access controls. There are no advertising trackers.
          Anyone with access to your unlocked device may be able to read them. Use your device lock.
        </p>
        <p>
          Backups, history exports and calendar files contain personal medication information and
          are not encrypted by Reminduh. Store them privately.{' '}
          {isNative
            ? 'Deleting the app removes its local records; export a backup first. Device backups may include app data according to your iPhone settings.'
            : 'Clearing browser data deletes your local records; export a backup first.'}
        </p>
        <p>
          Audio files you choose for the record player stay on your device and are not uploaded.
          Apple Music, when connected in the iPhone app, accesses your music library with
          permission. Disconnect it in the record player. It does not receive your medication
          records.
        </p>
        {isNative && (
          <p>
            Optional leaf purchases are handled by Apple. Purchased leaves stay in this iPhone’s
            separate wallet and are not included in health backups or synced between devices.
          </p>
        )}
        {isNative && (
          <p>
            During TestFlight testing, Apple shares beta crash reports, usage information and
            feedback with the developer. Avoid including medication details in screenshots or
            feedback.
          </p>
        )}
        <p>
          You can sign out to remove this account’s copy from the current device, or delete your
          account and cloud records in Account. Database recovery backups may retain deleted records
          for up to 24 hours. Exports you saved yourself remain until you remove them.
        </p>
        <Link className="text-link" to="/profile#your-data">
          Export, restore or delete your data
        </Link>
      </section>
      <section className="panel">
        <h2>Accessibility status</h2>
        <p>
          We are working towards WCAG 2.2 level AA. This development version has not been
          independently certified. Automated and keyboard checks do not replace testing with
          disabled people and assistive technology.
        </p>
        <p>
          If something stops you using the app, share the page, action and any assistive technology
          you use with the person who provided this development version. Do not include medication
          details or backup files.
        </p>
      </section>
    </div>
  );
}
