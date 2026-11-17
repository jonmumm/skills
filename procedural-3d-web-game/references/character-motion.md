# Character motion: rig by intent, check poses with numbers

Back Nine (Nov 2026) taught these. Its procedural golfer is driven by IK targets that are pure
functions of the shot timeline. Two bugs got through rounds of image critics:
- **Bowed knees:** the pelvis turned up to 72° while the legs hung square off the root, which
  bowed the knees at the top of the swing and crossed the legs at the finish.
- **Arm on the wrong side:** a fixed "elbow back" pole made the trail elbow fly out once the
  chest turned. A hack that lifted the hands behind the head, so they would show past a big
  head, raised the critic score and put the arm on the wrong side.

The critic loop scored that frame 8.2/10 against its target. Jon caught both bugs by eye.

## Author intents, not keyframes
- A control rig is a few targets: hands, feet, the pelvis and chest yaw, the swing pivot, and
  the elbow and knee poles. Each is a pure function of the beat time (`pose(tau)`), so tests
  and probes can sample any moment headlessly. Two-bone IK solves the limbs.
- **Solve every chain from a socket on the parent that actually moves.** If the pelvis turns,
  the hip sockets turn with it, the feet stay where they were planted, and the knees bend toward
  where the hips face. Never hang the legs off the root.
- **Poles depend on the pose.** Express each elbow and knee pole in the turned chest or pelvis
  frame, per key pose, from how the real motion looks. For example, at the top of a golf swing
  the trail elbow points at the ground. A single world-space pole is right at only one pose.
- Never move a joint to please the camera. Move the camera, or change the proportions.

## Pose assertions beat image critics for anatomy
- Write a unit test for each key pose that checks numbers in rig space, using the motion's
  domain rules. For a golf swing:
  - at the top, the hands are above the trail shoulder and in front of the head;
  - the trail elbow is below the hands;
  - the lead arm crosses the chest;
  - the knees stay over the toes;
  - bone lengths are kept, and planted feet move less than 1 cm.
- Run the assertions every round, next to the critic. A critic score never overrules a failed
  pose assertion.
- Critics matching a still image score silhouette and colour. They don't reliably see that
  the wrong arm is in front, so give them the pose sheet below and ask about anatomy directly.

## Evidence: a pose sheet, not only the game camera
- Use a probe that renders the character alone, at each key moment and from 4 orbit angles
  (0/90/180/270), plus one view from the game camera. One view hides which arm is in front.
  Back Nine's is `tv-scene/scripts/_pose-probe.mjs` (`--taus`, `--angs`).
- Put the reference pose next to each frame at the same angle.

## Base the numbers on real motion
In order of cost:
1. **Real footage → pose estimation.** Use a clip you're allowed to use, ffmpeg the key frames,
   then run a local pose estimator such as MediaPipe Pose (free, runs on the machine) to get
   landmarks. Fit IK targets at the key poses only and ease between them. Fitting key poses
   throws away the per-frame noise that "video to mocap" otherwise needs cleaning.
2. **Free mocap libraries** (for example CMU). Check each clip's licence before shipping it, and
   record it in the credits file.
3. **A video model makes a reference sheet:** the same motion from 4 sides, then pose
   estimation as in 1. This is paid (Runway or fal), so ask Jon first.

Keep the fitted key poses as test fixtures, and have the pose tests compare against them with
tolerances. Then the "outcome" (a backswing, picking up a box) has a measurable definition,
instead of numbers someone invented and tuned until a still frame looked right.
