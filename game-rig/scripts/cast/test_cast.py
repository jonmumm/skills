"""Tests for the cast helper, with a fake pychromecast (no device, no network, no cost)."""
import io
import json
import unittest

import castlib


class FakeController:
    def __init__(self):
        self.sent = []
        self.is_active = True
        self.handler = None

    def launch(self, callback_function=None):
        callback_function(True, {})

    def send_message(self, data, no_add_request_id=False):
        self.sent.append(data)


class FakeCast:
    def __init__(self):
        self.quit_calls = 0
        self.cast_info = type("Info", (), {"host": "10.0.0.9"})()

    def wait(self, timeout=None):
        pass

    def register_status_listener(self, listener):
        pass

    def register_handler(self, handler):
        pass

    def quit_app(self):
        self.quit_calls += 1


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


def run(argv, stdin=""):
    cast, ctrl, clock, out = FakeCast(), FakeController(), FakeClock(), io.StringIO()
    args = castlib.parse_args(argv)
    code = castlib.run(args, connect=lambda name: (cast, lambda: None), controller=ctrl, clock=clock, stdin=io.StringIO(stdin), stdout=out)
    events = [json.loads(line) for line in out.getvalue().splitlines() if line.strip()]
    return code, cast, ctrl, clock, events


class CastTests(unittest.TestCase):
    def test_default_timeout_stops_the_receiver(self):
        code, cast, ctrl, clock, events = run(["launch", "--device", "Chromecast HD", "--minutes", "2"])
        self.assertEqual(code, 0)
        self.assertEqual(cast.quit_calls, 1)
        self.assertGreaterEqual(clock.now - 1000.0, 120)
        self.assertLess(clock.now - 1000.0, 125)
        self.assertIn("timeout", [e["event"] for e in events])

    def test_first_message_is_get_state_so_the_receiver_never_starts_a_paid_default_view(self):
        _, _, ctrl, _, _ = run(["launch", "--minutes", "1"])
        self.assertEqual(ctrl.sent[0], {"type": "GET_STATE"})
        self.assertFalse(any(m.get("type") == "LOAD_VIEW" for m in ctrl.sent))

    def test_default_minutes_is_ten(self):
        self.assertEqual(castlib.parse_args(["launch"]).minutes, 10)

    def test_keep_disables_the_timeout_until_quit(self):
        code, cast, _, clock, events = run(["bridge", "--keep"], stdin='{"send": {"type": "GET_STATE"}}\n{"quit": true}\n')
        self.assertEqual(code, 0)
        self.assertEqual(cast.quit_calls, 1)
        self.assertNotIn("timeout", [e["event"] for e in events])

    def test_bridge_relays_stdin_messages_to_the_receiver(self):
        _, _, ctrl, _, _ = run(["bridge", "--minutes", "5"], stdin='{"send": {"type": "PEER_STOP"}}\n{"quit": true}\n')
        self.assertIn({"type": "PEER_STOP"}, ctrl.sent)

    def test_cloud_view_needs_confirm_paid(self):
        with self.assertRaises(SystemExit):
            castlib.parse_args(["launch", "--view", "https://g/tv/A", "--stream-server", "https://api/stream"])
        args = castlib.parse_args(["launch", "--view", "https://g/tv/A", "--stream-server", "https://api/stream", "--confirm-paid", "--minutes", "1"])
        self.assertEqual(castlib.view_message(args), {"type": "LOAD_VIEW", "viewUrl": "https://g/tv/A", "streamServerUrl": "https://api/stream"})

    def test_cloud_view_is_sent_after_get_state_and_still_times_out(self):
        code, cast, ctrl, _, _ = run(["launch", "--view", "https://g/tv/A", "--stream-server", "https://s", "--confirm-paid", "--minutes", "1"])
        self.assertEqual([m["type"] for m in ctrl.sent[:2]], ["GET_STATE", "LOAD_VIEW"])
        self.assertEqual(cast.quit_calls, 1)

    def test_minutes_has_a_ceiling(self):
        with self.assertRaises(SystemExit):
            castlib.parse_args(["launch", "--minutes", "500"])


if __name__ == "__main__":
    unittest.main()
