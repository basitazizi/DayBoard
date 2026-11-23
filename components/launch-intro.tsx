/**
 * The Android app's opening animation: the DayBoard mark builds itself on the same dark background
 * as the native splash screen, then fades into the app. Pure CSS, so it plays from the first frame;
 * it only shows when the <head> script sets data-launch (in the app, once per launch).
 */
export function LaunchIntro() {
  return (
    <div aria-hidden className="launch-intro">
      <div className="launch-stack">
        <svg viewBox="0 0 64 64" className="launch-logo">
          <rect className="launch-row" style={{ animationDelay: "80ms" }} x="15" y="15" width="9" height="9" rx="3" />
          <rect className="launch-row" style={{ animationDelay: "180ms" }} x="15" y="27.5" width="9" height="9" rx="3" />
          <rect className="launch-row" style={{ animationDelay: "280ms" }} x="15" y="40" width="9" height="9" rx="3" />
          <path className="launch-arc" d="M28 15h3.5c9.4 0 17 7.6 17 17s-7.6 17-17 17H28" pathLength={100} />
        </svg>
        <span className="launch-name">DayBoard</span>
      </div>
    </div>
  );
}
