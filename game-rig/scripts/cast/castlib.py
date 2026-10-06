"""
Chromecast launcher for the OGS receiver (Cast app 807AD5E9 -> https://opengame.org/receiver.html),
from rocket-crew/scripts/cast-bridge.py. Every run has a hard wall-clock limit: the receiver app is
stopped after --minutes (default 10) unless --keep, and ALWAYS on exit (quit, EOF, Ctrl-C, SIGTERM).

Modes:
  list                       Cast devices on the LAN.
  launch                     Receiver up on the device; prints receiver messages; GET_STATE every 10 s.
  bridge                     JSON lines for harnesses (e.g. rocket-crew cast-device-check.mts):
                               stdout {"event": "ready"|"app"|"message"|"timeout"|"closed"|"error", ...}
                               stdin  {"send": {...}} to the receiver, or {"quit": true}; EOF = quit.
  stop                       Stop whatever app the device is showing.

The first message is always GET_STATE: a receiver that hears nothing for 8 s starts its default
CLOUD view, which bills a GPU stream. LOAD_VIEW (cloud rendering, ~$1.4/h) is only sent with
--view URL --stream-server URL --confirm-paid.
"""
import argparse
import json
import queue
import signal
import sys
import threading
import time

NAMESPACE = "urn:x-cast:org.opengame.view"
APP_ID = "807AD5E9"
MAX_MINUTES = 180
STATE_EVERY_S = 10


def parse_args(argv):
    p = argparse.ArgumentParser(prog="game-rig cast", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["list", "launch", "bridge", "stop"])
    p.add_argument("--device", default="Chromecast HD", help="friendly name (default: Chromecast HD)")
    p.add_argument("--minutes", type=float, default=10, help=f"stop the receiver after this long (default 10, max {MAX_MINUTES})")
    p.add_argument("--keep", action="store_true", help="no time limit (still stopped on exit)")
    p.add_argument("--view", help="TV page for the CLOUD path (LOAD_VIEW); needs --stream-server and --confirm-paid")
    p.add_argument("--stream-server", help="OGS stream server for --view")
    p.add_argument("--confirm-paid", action="store_true", help="I know --view starts a billed GPU stream")
    args = p.parse_args(argv)
    if args.minutes <= 0 or args.minutes > MAX_MINUTES:
        p.error(f"--minutes must be in (0, {MAX_MINUTES}]")
    if args.view and not (args.stream_server and args.confirm_paid):
        p.error("--view renders on the cloud GPU (billed): pass --stream-server URL and --confirm-paid")
    return args


def view_message(args):
    if not args.view:
        return None
    return {"type": "LOAD_VIEW", "viewUrl": args.view, "streamServerUrl": args.stream_server}


class RealClock:
    def time(self):
        return time.time()

    def sleep(self, s):
        time.sleep(s)


def _emit(stdout, obj):
    stdout.write(json.dumps(obj) + "\n")
    stdout.flush()


def run(args, connect, controller, clock, stdin=sys.stdin, stdout=sys.stdout):
    """Launch, relay, stop. `connect(name)` -> (cast, stop_discovery). Returns the exit code."""
    out = lambda obj: _emit(stdout, obj)  # noqa: E731
    cast, stop_discovery = connect(args.device)
    if cast is None:
        out({"event": "error", "message": f"no Cast device named {args.device!r}"})
        stop_discovery()
        return 2
    stopped = threading.Event()

    def stop(reason):
        if stopped.is_set():
            return
        stopped.set()
        try:
            cast.quit_app()
            out({"event": "closed", "reason": reason, "message": "receiver app stopped"})
        except Exception as e:  # noqa: BLE001
            out({"event": "error", "message": f"quit_app failed: {e}"})
        stop_discovery()

    if args.mode == "stop":
        stop("stop")
        return 0

    try:
        cast.wait(timeout=20)
        cast.register_handler(controller)
        launched = threading.Event()
        controller.launch(callback_function=lambda ok, _r: launched.set() if ok else out({"event": "error", "message": "launch failed"}))
        launched.wait(30)
        for _ in range(100):
            if controller.is_active:
                break
            clock.sleep(0.1)
        send = lambda msg: controller.send_message(msg, no_add_request_id=True)  # noqa: E731
        send({"type": "GET_STATE"})  # a sender spoke: the receiver won't start its paid default view
        view = view_message(args)
        if view:
            send(view)
        deadline = None if args.keep else clock.time() + args.minutes * 60
        out({"event": "ready", "device": args.device, "host": cast.cast_info.host, "active": controller.is_active, "stopsAt": deadline})

        inbox = queue.Queue()
        if args.mode == "bridge":
            def reader():
                for line in stdin:
                    if line.strip():
                        inbox.put(line)
                inbox.put(None)  # EOF

            threading.Thread(target=reader, daemon=True).start()
        last_state = clock.time()
        real = isinstance(clock, RealClock)
        while True:
            if deadline is not None and clock.time() >= deadline:
                out({"event": "timeout", "minutes": args.minutes})
                stop("timeout")
                return 0
            try:
                line = inbox.get(timeout=0.5 if real else 0.01)
            except queue.Empty:
                line = ""
                if not real:
                    clock.sleep(1)  # a fake clock only moves when told to
            if line is None:
                stop("eof")
                return 0
            if line:
                msg = json.loads(line)
                if msg.get("quit"):
                    stop("quit")
                    return 0
                if "send" in msg:
                    try:
                        send(msg["send"])
                    except Exception as e:  # noqa: BLE001
                        out({"event": "error", "message": f"send failed: {e}"})
            if args.mode == "launch" and clock.time() - last_state >= STATE_EVERY_S:
                last_state = clock.time()
                send({"type": "GET_STATE"})
    except KeyboardInterrupt:
        stop("interrupt")
        return 130
    finally:
        stop("exit")


# ── Real pychromecast wiring (imported lazily so tests never need it) ──


def real_connect(name):
    import pychromecast

    casts, browser = pychromecast.get_listed_chromecasts(friendly_names=[name], timeout=15)
    return (casts[0] if casts else None), browser.stop_discovery


def real_controller(stdout=sys.stdout):
    from pychromecast.controllers import BaseController

    class ViewController(BaseController):
        def __init__(self):
            super().__init__(NAMESPACE, APP_ID)

        def receive_message(self, _message, data):
            _emit(stdout, {"event": "message", "data": data})
            return True

    return ViewController()


def list_devices(stdout=sys.stdout):
    import pychromecast

    casts, browser = pychromecast.get_chromecasts(timeout=8)
    for c in casts:
        _emit(stdout, {"event": "device", "name": c.cast_info.friendly_name, "host": c.cast_info.host, "model": c.cast_info.model_name})
    browser.stop_discovery()
    return 0


def main(argv):
    args = parse_args(argv)
    if args.mode == "list":
        return list_devices()
    def on_term(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, on_term)
    return run(args, real_connect, real_controller(), RealClock())
