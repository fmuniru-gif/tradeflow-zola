/* Deployment operator: enter the existing production project URL and its PUBLIC
 * publishable (or legacy anon) key. Enter SHA-256 fingerprints recorded first
 * from independently verified existing TradeFlow configuration evidence.
 * The page refuses missing or mismatched fingerprints before Owner sign-in.
 * Then hash this exact file before publishing.
 * Never put a service-role, secret, password, or access token here.
 * Empty values keep the Owner sign-in disabled. */
window.R70TOwnerDiagnosticConfig=Object.freeze({
  supabaseUrl:'https://ruadyqcsutfprrxdaahi.supabase.co',
  publishableKey:'sb_publishable_x8J_l2uW9H8dUWMJc0mf3w_R6r1ep4m',
  expectedProjectUrlSha256:'28a5b9009b9b16114c7771abea02e6373c778a401c4bc98df8f3d4fd55c72284',
  expectedPublishableKeySha256:'7a3b31d368e9166a7edf7f64be4459781a3daf985d116db7f6b9f49c19f0baf7'
});
