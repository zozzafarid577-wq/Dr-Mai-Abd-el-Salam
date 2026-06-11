// In-memory stand-in for '@supabase/supabase-js'.
//
// Test files install it with:
//   vi.mock('@supabase/supabase-js', () => import('../helpers/supabase-mock.js'));
// and then drive it through configureSupabaseMock() / getSupabaseCalls().
//
// The api/ handlers create their clients at module scope, so the same two
// client objects are reused for every test in a file; state is reset between
// tests via resetSupabaseMock() (call it in beforeEach).

const state = {
  authUser: undefined, // user returned by anon auth.getUser; null => invalid token
  results: {}, // '<table>.<op>' or 'auth.admin.<fn>' -> result | result[] | fn(call)
  calls: [], // every table/auth operation, in order
};

export const ADMIN_USER = Object.freeze({
  id: 'admin-uid',
  app_metadata: { role: 'admin' },
});

export const STUDENT_USER = Object.freeze({
  id: 'student-uid',
  app_metadata: { role: 'student' },
});

export function configureSupabaseMock({ authUser, results } = {}) {
  if (authUser !== undefined) state.authUser = authUser;
  if (results) Object.assign(state.results, results);
}

export function resetSupabaseMock() {
  state.authUser = ADMIN_USER;
  state.results = {};
  state.calls = [];
}

export function getSupabaseCalls(filter) {
  if (!filter) return [...state.calls];
  return state.calls.filter((c) => `${c.table}.${c.op}` === filter || c.op === filter);
}

resetSupabaseMock();

function resolveResult(key, call, fallback) {
  let r = state.results[key];
  if (Array.isArray(r) && !('data' in r)) r = r.length > 1 ? state.results[key].shift() : r[0];
  if (typeof r === 'function') r = r(call);
  if (r === undefined) r = fallback;
  return r;
}

class QueryBuilder {
  constructor(table) {
    this.call = { table, op: null, payload: undefined, filters: {} };
  }
  select(cols) {
    if (!this.call.op) this.call.op = 'select';
    this.call.columns = cols;
    return this;
  }
  insert(payload) {
    this.call.op = 'insert';
    this.call.payload = payload;
    return this;
  }
  upsert(payload, opts) {
    this.call.op = 'upsert';
    this.call.payload = payload;
    this.call.opts = opts;
    return this;
  }
  update(payload) {
    this.call.op = 'update';
    this.call.payload = payload;
    return this;
  }
  delete() {
    this.call.op = 'delete';
    return this;
  }
  eq(col, val) {
    this.call.filters[col] = val;
    return this;
  }
  in(col, vals) {
    this.call.filters[col] = vals;
    return this;
  }
  order() {
    return this;
  }
  #resolve() {
    state.calls.push(this.call);
    const key = `${this.call.table}.${this.call.op}`;
    return resolveResult(key, this.call, { data: null, error: null });
  }
  single() {
    this.call.single = true;
    return Promise.resolve(this.#resolve());
  }
  maybeSingle() {
    return this.single();
  }
  then(onFulfilled, onRejected) {
    return Promise.resolve(this.#resolve()).then(onFulfilled, onRejected);
  }
}

function makeAdminAuthFn(name) {
  return async (...args) => {
    const call = { op: `auth.admin.${name}`, args };
    state.calls.push(call);
    return resolveResult(call.op, call, { data: { user: { id: args[0]?.email ? 'new-uid' : args[0] } }, error: null });
  };
}

async function rpc(fn, args) {
  const call = { op: `rpc.${fn}`, args };
  state.calls.push(call);
  return resolveResult(call.op, call, { data: [], error: null });
}

const anonClient = {
  auth: {
    async getUser(token) {
      state.calls.push({ op: 'auth.getUser', args: [token] });
      const user = state.authUser;
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } };
    },
  },
  from: (table) => new QueryBuilder(table),
  rpc,
};

const adminClient = {
  auth: {
    admin: {
      createUser: makeAdminAuthFn('createUser'),
      deleteUser: makeAdminAuthFn('deleteUser'),
      updateUserById: makeAdminAuthFn('updateUserById'),
    },
  },
  from: (table) => new QueryBuilder(table),
  rpc,
};

export function createClient(url, key, opts) {
  // Endpoints build a per-request client with the caller's token via
  // global.headers.Authorization; treat that like the anon client.
  const base = key === process.env.SUPABASE_SERVICE_ROLE_KEY ? adminClient : anonClient;
  return base;
}
