// Minimal stand-ins for Vercel's req/res objects, just enough for the api/ handlers.

export function makeReq({ method = 'POST', body = {}, token = 'test-token', headers = {} } = {}) {
  return {
    method,
    body,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
}

export function makeRes() {
  const res = {
    statusCode: null,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}
