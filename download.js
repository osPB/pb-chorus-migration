/*
  Download helpers
*/

// Download a single engagement using the provided session cookie for auth
export async function downloadEngagement(engagement, session) {
  return null;
}

// Download a slice of the page (sequentially, uses one session)
export async function downloadMultiple(items, session) {
  for (let engagement of items) {
    await downloadEngagement(engagement, session);
  }
}
