// Using global fetch (standard in Node 18+ and Next.js)

async function triggerScrub() {
  const url = 'http://localhost:3000/api/scrub-ghosts'; // Assuming local dev
  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    console.log('Scrub result:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Trigger failed:', err);
  }
}

triggerScrub();
