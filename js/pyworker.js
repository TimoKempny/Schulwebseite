/* ==========================================================
   pyworker.js – führt Python (Pyodide) in einem Web Worker aus.
   Wird von python-editor.html gestartet. Normalerweise nicht ändern.

   Eingaben (input) und time.sleep blockieren den Worker über
   SharedArrayBuffer + Atomics. Das geht nur, wenn die Seite
   "cross-origin isolated" ist (dafür sorgt coi-sw.js).
   ========================================================== */

import { loadPyodide } from "./pyodide/pyodide.mjs";

let py = null;
let runFn = null, replFn = null, replResetFn = null;
let ctrl = null;   // Int32Array: [0] Zustand, [1] Länge der Eingabe
let data = null;   // Uint8Array: Eingabetext (UTF-8)
let intr = null;   // Uint8Array: Interrupt-Puffer für Pyodide (2 = SIGINT)

const S_WAIT = 0, S_INPUT = 1, S_EOF = 2, S_STOP = 3;
const dec = new TextDecoder();

/* ---------- Ausgabe gepuffert weiterreichen ---------- */
let outBuf = "", outStream = "out", lastFlush = 0;
function flush() {
  if (outBuf) { postMessage({ t: "out", s: outBuf, stream: outStream }); outBuf = ""; }
  lastFlush = performance.now();
}
function write(s, stream) {
  if (stream !== outStream) { flush(); outStream = stream; }
  outBuf += s;
  if (outBuf.length > 8192 || performance.now() - lastFlush > 40) flush();
}

/* ---------- Eingabe: blockiert, bis die Seite antwortet ---------- */
let waitedMs = 0;
function readInput() {
  flush();
  if (!ctrl) return -2;
  Atomics.store(ctrl, 0, S_WAIT);
  postMessage({ t: "input" });
  const t0 = performance.now();
  while (Atomics.load(ctrl, 0) === S_WAIT) Atomics.wait(ctrl, 0, S_WAIT, 1000);
  waitedMs += performance.now() - t0;
  const st = Atomics.load(ctrl, 0);
  Atomics.store(ctrl, 0, S_WAIT);
  if (st === S_INPUT) return dec.decode(data.slice(0, ctrl[1]));
  if (st === S_EOF) return null;
  intr[0] = 0;
  return -1; // Stopp
}

/* ---------- time.sleep: wartet, bleibt aber stoppbar ---------- */
function sleep(sec) {
  flush();
  const end = performance.now() + Math.max(0, Number(sec) || 0) * 1000;
  if (!ctrl) { while (performance.now() < end) { /* aktiv warten */ } return 0; }
  for (;;) {
    const rest = end - performance.now();
    if (rest <= 0) return 0;
    Atomics.wait(ctrl, 0, S_WAIT, rest);
    if (Atomics.load(ctrl, 0) === S_STOP) { Atomics.store(ctrl, 0, S_WAIT); intr[0] = 0; return -1; }
  }
}

/* ---------- Python-Seite ---------- */
const PRELUDE = String.raw`
import sys, builtins, time, traceback, linecache, json, codeop
import _editor

class _Stream:
    def __init__(self, name):
        self._name = name
    def write(self, s):
        if not isinstance(s, str):
            raise TypeError("write() argument must be str, not " + type(s).__name__)
        _editor.write(s, self._name)
        return len(s)
    def flush(self):
        pass
    def isatty(self):
        return True
    def writable(self):
        return True
    encoding = "utf-8"
    errors = "strict"

_out, _err = _Stream("out"), _Stream("err")

def _input(prompt=""):
    if prompt != "":
        sys.stdout.write(str(prompt))
    r = _editor.read_input()
    if r == -1:
        raise KeyboardInterrupt
    if r == -2:
        raise RuntimeError("input() ist in diesem Browserfenster nicht verfügbar")
    if r is None:
        raise EOFError("EOF when reading a line")
    return r

def _sleep(sec):
    if _editor.sleep(sec) == -1:
        raise KeyboardInterrupt

CONSOLE = "<konsole>"
_files = set()          # Dateinamen mit Nutzer-Code (Programm + Konsole)
_ns = {"__name__": "__main__", "__builtins__": builtins}   # gemeinsamer Namensraum
_repl_buf = []
_cc = codeop.CommandCompiler()

def _prepare():
    sys.stdout, sys.stderr = _out, _err
    builtins.input = _input
    time.sleep = _sleep
    sys.setrecursionlimit(1000)

def _syntax(e):
    text = "".join(traceback.format_exception_only(type(e), e))
    in_prog = e.filename != CONSOLE
    return {"error": {"kind": "syntax", "type": type(e).__name__, "msg": str(e.msg),
                      "line": (e.lineno or 0) if in_prog else 0, "col": e.offset or 1, "text": text}}

def _runtime(e, fname):
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename not in _files:
        tb = tb.tb_next
    te = traceback.TracebackException(type(e), e, tb)
    te.stack = traceback.StackSummary.from_list([f for f in te.stack if f.filename != "<exec>"])
    text = "".join(te.format())
    line, col = 0, 1
    for fs in traceback.extract_tb(e.__traceback__):
        if fs.filename == fname:
            line = fs.lineno or 0
            col = (getattr(fs, "colno", None) or 0) + 1
    return {"error": {"kind": "runtime", "type": type(e).__name__, "msg": str(e),
                      "line": line, "col": col, "text": text}}

def _exec(code, fname):
    try:
        exec(code, _ns)
    except SystemExit as e:
        c = e.code
        if c is None:
            c = 0
        elif not isinstance(c, int):
            sys.stderr.write(str(c) + "\n")
            c = 1
        return {"ok": True, "code": c, "exit": True}
    except KeyboardInterrupt:
        return {"stopped": True}
    except BaseException as e:
        return _runtime(e, fname)
    return {"ok": True, "code": 0}

def _run(src, fname):
    global _ns
    _prepare()
    _repl_buf.clear()
    _files.clear()
    _files.update((fname, CONSOLE))
    linecache.cache[fname] = (len(src), None, src.splitlines(True), fname)
    # neuer Namensraum je Lauf; die Konsole arbeitet danach mit diesem weiter
    _ns = {"__name__": "__main__", "__builtins__": builtins, "__file__": fname}
    try:
        code = compile(src, fname, "exec")
    except SyntaxError as e:
        return json.dumps(_syntax(e))
    return json.dumps(_exec(code, fname))

def _repl(line, fname):
    _prepare()
    _files.add(CONSOLE)
    _repl_buf.append(line)
    src = "\n".join(_repl_buf)
    try:
        code = _cc(src, CONSOLE, "single")
    except (SyntaxError, OverflowError, ValueError) as e:
        _repl_buf.clear()
        if not isinstance(e, SyntaxError):
            e = SyntaxError(str(e))
        return json.dumps(_syntax(e))
    if code is None:
        return json.dumps({"more": True})
    _repl_buf.clear()
    linecache.cache[CONSOLE] = (len(src), None, (src + "\n").splitlines(True), CONSOLE)
    return json.dumps(_exec(code, fname))

def _repl_reset():
    _repl_buf.clear()
`;

async function init(msg) {
  if (msg.sab) {
    ctrl = new Int32Array(msg.sab, 0, 4);
    data = new Uint8Array(msg.sab, 16);
    intr = new Uint8Array(msg.intr);
  }
  try {
    py = await loadPyodide({ stdout: (s) => write(s + "\n", "out"), stderr: (s) => write(s + "\n", "err") });
    if (intr) py.setInterruptBuffer(intr);
    py.registerJsModule("_editor", {
      write: (s, stream) => write(s, stream),
      read_input: () => readInput(),
      sleep: (sec) => sleep(sec)
    });
    py.runPython(PRELUDE);
    runFn = py.globals.get("_run");
    replFn = py.globals.get("_repl");
    replResetFn = py.globals.get("_repl_reset");
    postMessage({ t: "ready", version: py.version, python: py.runPython("import sys; sys.version.split()[0]"), input: !!ctrl });
  } catch (e) {
    postMessage({ t: "loaderror", msg: String(e && e.message || e) });
  }
}

function execute(kind, fn, args) {
  if (!fn) return;
  waitedMs = 0;
  if (intr) intr[0] = 0;
  if (ctrl) Atomics.store(ctrl, 0, S_WAIT);
  const t0 = performance.now();
  let res;
  try {
    res = JSON.parse(fn(...args));
  } catch (e) {
    flush();
    // schwerer Fehler im Interpreter (z. B. Stacküberlauf) – Worker wird neu gestartet
    postMessage({ t: "fatal", msg: String(e && e.message || e) });
    return;
  }
  flush();
  res.ms = Math.round(performance.now() - t0 - waitedMs);
  res.waited = waitedMs > 0;
  postMessage({ t: kind, res: res });
}

onmessage = (ev) => {
  const msg = ev.data;
  if (msg.t === "init") init(msg);
  else if (msg.t === "run") execute("done", runFn, [msg.src, msg.fname]);
  else if (msg.t === "repl") execute("repldone", replFn, [msg.line, msg.fname]);
  else if (msg.t === "replreset" && replResetFn) replResetFn();
};
