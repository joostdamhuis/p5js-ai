// The dev server is reachable from the local network; only let this Mac write sketches
export const isLocalRequest = (request: Request) => {
  const host = (request.headers.get('host') || '').replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
};

export const forbidden = () => Response.json({ error: 'Only available on this computer' }, { status: 403 });
