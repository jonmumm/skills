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

## Measure the model before tuning the rig
- Read the real joints and proportions out of the GLB before touching pose numbers. Parse the
  skin's inverse bind matrices for the joint rest positions, and the vertices weighted to each
  bone for its extent (a 30-line Python script does it, no Blender needed). Check the rig's
  limb lengths against them.
- **Know where each bone starts.** In Back Nine, golfer.glb's hand bone starts at the wrist and
  its palm centres 9 cm further on. The solver put the hand bone on the club grip, so every
  arm holding the club was overstretched by a hand's length, for weeks. Solve the arm to the
  wrist, a palm up the shaft from the grip.
- Stylized proportions (big head, wide shoulders, short arms) make some real poses impossible.
  Find out which, by measuring, before tuning numbers against a target image.

## Swing arcs and body sync
- **A held object follows the arm that can reach it.** Arcs centred somewhere convenient (the
  chest) drift past the arm's length. Clamp the reach: when the target is further than the arm
  plus a little give (Back Nine allows 8%), move the hands and the held club toward the
  shoulder. Don't stretch the arm.
- **Sequence the body the way real movement does.** In a golf downswing the hips lead, and the
  chest follows the arms (it unwinds with them and is about square at impact). Unwinding the
  chest early left the hands far behind it, stretching the lead arm 35%.
- Keep the joins continuous: when one phase's formula changes, start the next phase from where
  the first one ends (the finish's twist starts at the impact twist).

## Pose assertions beat image critics for anatomy
- Write a unit test for each key pose that checks numbers in rig space, using the motion's
  domain rules. For a golf swing:
  - at the top, the hands are about cap height over the trail shoulder (behind the head as the
    tee camera sees it);
  - the trail elbow is below the hands;
  - the lead arm crosses the chest;
  - the knees stay over the toes;
  - bone lengths are kept, and planted feet move less than 1 cm.
- Run the assertions every round, next to the critic. A critic score never overrules a failed
  pose assertion.
- Critics matching a still image score silhouette and colour. They don't reliably see that
  the wrong arm is in front, so give them the pose sheet below and ask about anatomy directly.
- **Write checks in the camera's terms as well as the body's.** "The trail elbow folds
  downward" passed while the elbow stuck straight out at the tee camera. Seen from that camera,
  "toward the lens" is "ahead of the chest", so cap that too. Bound every check on both sides
  (not behind the chest *and* not more than a hand's width ahead of it).
- **Add any rule the reference image implies.** A search that satisfied every check put the
  hands in front of the face. The target has them behind the head, so that became a check.
- Any threshold the model's proportions force you to loosen, write down in the test with the
  reason ("a touch of lead-arm bend: these shoulders can't also keep it straight").
- **Make the pose maths importable in node.** Bundler asset imports (`?url`, `.png`) stop a
  module loading in tests. Keep the pose functions in a module that imports only three.js, and
  let the system mix them in.

## Tune pose numbers by search, then look
- With the pose maths in node, grid-search the free constants (pivot offsets, reach, pole
  directions) against every pose assertion: thousands of candidates in seconds, scored by the
  smallest margin. That beats build-render-squint loops of minutes each.
- Then render the winner from every angle. A search finds whatever your checks allow, so a
  pose that passes and still looks wrong means a check is missing. Add it and search again.

## Evidence: a pose sheet, not only the game camera
- Use a probe that renders the character alone, at each key moment and from 4 orbit angles
  (0/90/180/270), plus one view from the game camera. One view hides which arm is in front.
  Back Nine's is `tv-scene/scripts/pose-sheet.mjs` (`--taus`, `--angs`, `tv` for the game camera).
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
