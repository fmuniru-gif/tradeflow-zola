/* Local staff session expiry. Device enrollment, Cloud transport and business data stay intact. */
(function () {
  'use strict';
  const TIMEOUT = 5 * 60 * 1000;
  function createController(env) {
    let user = '', expired = '', wall = 0, monotonic = 0, timer = null;
    function cancel() { if (timer !== null) env.clearTimeout(timer); timer = null; }
    function signedOut() { cancel(); user = ''; expired = ''; }
    function elapsed() { return Math.max(env.now() - wall, env.monotonic() - monotonic, 0); }
    function schedule() { if (timer === null) timer = env.setTimeout(()=>{timer=null;check();}, Math.max(1, TIMEOUT - elapsed())); }
    function start(id) { cancel(); user = id; expired = ''; wall = env.now(); monotonic = env.monotonic(); schedule(); }
    function check() {
      const id = String(env.identity() || '');
      if (!id) { signedOut(); return true; }
      if (id === expired) return false;
      if (id !== user) { start(id); return true; }
      if (elapsed() >= TIMEOUT) {
        cancel(); expired = id;
        env.logout();
        return false;
      }
      schedule();
      return true;
    }
    function activity(trusted, visible) {
      if (!check()) return false; // A late first click must not revive an expired session.
      if (trusted && visible && user) { wall = env.now(); monotonic = env.monotonic(); }
      // One timer; high-frequency pointer/scroll activity does not recreate it.
      return true;
    }
    function signedIn() { const id = String(env.identity() || ''); if (id) start(id); else signedOut(); }
    return Object.freeze({check,activity,signedIn,signedOut,timeout:TIMEOUT});
  }
  if (typeof module === 'object' && module.exports) { module.exports = {createController,TIMEOUT}; return; }
  window.ZEZMS = window.ZEZMS || {};
  if (ZEZMS.idleSession) return;
  function identity() {
    const auth = ZEZMS.staffAuth;
    if (auth && auth.isActive && auth.isActive()) {
      const context = auth.getContext();
      return context && context.user && context.user.active !== false ? context.user.id : '';
    }
    return window.session && session.cashier ? String(session.cashier) : '';
  }
  const controller = createController({
    identity, now:()=>Date.now(), monotonic:()=>performance.now(),
    setTimeout:(fn,delay)=>window.setTimeout(fn,delay), clearTimeout:id=>window.clearTimeout(id),
    logout() {
      // Close privileged dialogs before the ordinary staff sign-out clears local authority.
      if (typeof window.closeModal === 'function') window.closeModal();
      const result = window.doLogout();
      Promise.resolve(result).then(()=>{
        document.dispatchEvent(new Event('zezms-staff-auth-changed'));
        const status = document.getElementById('sharedLoginStatus');
        if (status) status.textContent = 'Automatically signed out after 5 minutes of inactivity. Sign in to continue.';
        if (typeof window.toast === 'function') window.toast('Signed out after 5 minutes of inactivity.');
      }).catch(error=>console.error('Automatic staff sign-out failed',error));
    }
  });
  function wrap(target,name,after) {
    const original = target && target[name];
    if (typeof original !== 'function') return;
    target[name] = function () {
      const previous = window.session, previousIdentity = identity();
      const completed = ()=>{
        if (after !== controller.signedIn || window.session !== previous || identity() !== previousIdentity) after();
        else controller.check();
      };
      const result = original.apply(this,arguments);
      if (result && typeof result.then === 'function') return result.then(value=>{completed();return value;},error=>{controller.check();throw error;});
      completed(); return result;
    };
  }
  wrap(ZEZMS.staffAuth,'signInFromLogin',controller.signedIn);
  wrap(ZEZMS.staffAuth,'signOut',controller.signedOut);
  // Legacy login uses doLogin; shared-device login delegates to the wrapped staff method.
  wrap(window,'doLogin',controller.signedIn);
  wrap(window,'doLogout',controller.signedOut);
  function interaction(event) {
    if (!controller.activity(event.isTrusted === true,document.visibilityState !== 'hidden')) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  // Scroll events can be browser-trusted even when caused by rendering or scrollTop.
  // Count their initiating wheel/key/touch/pointer input, not layout-driven scrolling.
  for (const name of ['pointerdown','pointermove','keydown','click','wheel','touchstart','touchmove','input']) document.addEventListener(name,interaction,{capture:true,passive:false});
  // Returning from a sleeping/backgrounded window checks elapsed time without counting as activity.
  for (const name of ['focus','pageshow']) window.addEventListener(name,controller.check);
  document.addEventListener('visibilitychange',controller.check);
  document.addEventListener('zezms-staff-auth-changed',controller.check);
  ZEZMS.idleSession = Object.freeze({build:'20261105-five-minute-idle-r1',timeout:TIMEOUT});
  controller.check();
}());
