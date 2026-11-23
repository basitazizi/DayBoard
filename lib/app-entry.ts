/**
 * How the Android app starts: a short logo intro on every launch, and a Welcome screen
 * (create account / sign in / continue without one) until the person has chosen.
 * The website is unchanged.
 */

/** Set once the person has picked an option on the Welcome screen (or signed in). */
export const WELCOMED_KEY = "dayboard:welcomed";

/** Added to the Android app's user agent in capacitor.config.ts, so the page can tell before any script loads. */
export const APP_USER_AGENT = "DayBoardApp";

export function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    // Storage blocked: the Welcome screen may show again next time, which is harmless.
  }
}

/**
 * Runs in <head> before the page draws, so there is no flash of the wrong screen.
 * In the app only: turns on the launch intro once per app session, and sends someone who is
 * signed out, has no saved data and hasn't chosen yet to the Welcome screen.
 */
export const appEntryScript = `(function(){try{
var w=window,d=document.documentElement;
var app=/${APP_USER_AGENT}/.test(navigator.userAgent||"")||!!(w.Capacitor&&w.Capacitor.isNativePlatform&&w.Capacitor.isNativePlatform());
if(!app)return;
d.dataset.app="1";
function needsWelcome(){
if(/^\\/(welcome|login|privacy|delete-account|display)(\\/|$)/.test(location.pathname))return false;
if(localStorage.getItem("${WELCOMED_KEY}")||localStorage.getItem("dayboard:guest-data:v2"))return false;
for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.*-auth-token$/.test(k))return false;}
return true;}
if(needsWelcome()){d.style.visibility="hidden";location.replace("/welcome");return;}
if(!sessionStorage.getItem("dayboard:launched")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.dataset.launch="1";}
sessionStorage.setItem("dayboard:launched","1");
}catch(e){}})();`;
