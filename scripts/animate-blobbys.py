"""
Blender Python script: author REAL keyframe animations for all Blobby variants.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/animate-blobbys.py -- [--variant base] [--out-dir DIR]

Why this exists
---------------
The GLBs produced by `rig-blobbys.py` carry 32 animation clips, but every one of
them is a placeholder: 2 keyframes per channel, both holding the rest pose. The
character never moves from baked animation — all apparent life comes from the
procedural code in `src/components/scene/BlobbyModel.tsx`.

This script discards those placeholders and authors real, multi-keyframe motion
directly onto the existing (correctly weighted) rig, then re-exports the GLB.

Design constraints imposed by the app
-------------------------------------
1. `BlobbyModel.stripRootTracks()` strips Root *rotation and scale* only. Root
   POSITION is kept and is the rigid bounce channel — translating Spine instead
   stretches the torso away from the Root-parented legs and the silhouette morphs.
2. The app overwrites `Spine.scale` every frame (procedural breathing), so this
   script never keyframes scale.
3. The app applies head look-at as an *offset* on top of the animated pose, so
   `Head` rotation authored here survives.
4. Clip durations are preserved exactly, because HomePage/BlobbyModel timing
   constants (WALK_END = 9.0s, JUMP_END = 10.0s) are tuned to them.
"""

import bpy
import math
import os
import sys
from mathutils import Euler

# ── Config ──────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL_DIR = os.path.join(ROOT, "assets", "final")

FPS = 24
VARIANTS = ["base", "raincoat", "sweater", "glasses"]

# Bones that receive authored motion. Root carries rigid vertical bounce; its
# rotation/scale tracks are stripped by the app (see module docstring).
ANIMATED_BONES = ["Root", "Spine", "Head", "L_Arm", "R_Arm", "L_Leg", "R_Leg"]

D = math.radians  # degrees → radians shorthand


# ── Keyframe helpers ────────────────────────────────────────────────────────
def clear_pose(arm):
    """Reset every pose bone to its rest transform."""
    for pb in arm.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


def key_pose(arm, frame, bones=None):
    """Insert location+rotation keys for the given bones at `frame`."""
    for name in (bones or ANIMATED_BONES):
        pb = arm.pose.bones.get(name)
        if pb is None:
            continue
        pb.keyframe_insert(data_path="location", frame=frame)
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)


def set_bone(arm, name, rot=(0, 0, 0), loc=(0, 0, 0)):
    """Set a pose bone's euler rotation (degrees) and location."""
    pb = arm.pose.bones.get(name)
    if pb is None:
        return
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = Euler((D(rot[0]), D(rot[1]), D(rot[2])), 'XYZ')
    pb.location = loc


def smooth_action(action):
    """Give every curve smooth bezier interpolation."""
    for layer in action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'BEZIER'
                        kp.handle_left_type = 'AUTO_CLAMPED'
                        kp.handle_right_type = 'AUTO_CLAMPED'
                    fc.update()


def new_action(arm, name):
    """Create an action, bind it to the armature, and return it."""
    if arm.animation_data is None:
        arm.animation_data_create()
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    # Blender 5.0 slotted actions: binding the action then keyframing creates
    # the slot automatically, but assigning explicitly is more reliable.
    try:
        slot = action.slots.new(id_type='OBJECT', name=arm.name)
        arm.animation_data.action_slot = slot
    except Exception:
        pass
    return action


# ── Animation authoring ─────────────────────────────────────────────────────
# Each builder receives (arm, total_frames) and keyframes the whole clip.
# Looping clips repeat their frame-0 pose on the final frame.
#
# STAGING NOTES — these gestures are authored for one specific shot, not in the
# abstract. Getting this wrong is what made the first pass read as random:
#
#  * Blobby spends every state except `walk_to_cushion` SEATED on a beanbag
#    (measured centre x=1.26 z=-0.01, top y=0.86). A walking gait on a seated
#    character is the single most obvious "clashes with the environment" tell,
#    so only `walk_to_cushion` alternates the legs. Seated clips keep the legs
#    planted and express through torso, arms and head.
#  * The camera is a fixed isometric ortho rig and Blobby renders roughly 60px
#    tall, so gestures must read at that size — but there is a hard ceiling.
#    Past roughly 15deg of spine rotation this mesh visibly deforms: the body
#    stretches, squashes and the arms fuse into the torso, so the character stops
#    holding a recognisable shape. Amplitudes below are capped under that ceiling.
#    Readability comes from rigid vertical bounce and moderate lean, NOT from
#    cranking rotation until the blob turns to putty.

# CHANNEL LEVERAGE — measured, not assumed. Mean vertex displacement produced by
# each channel on the 0.814-tall mesh (scripts/measure-leverage.py):
#
#     Spine.rotX 30deg   0.111      Head.rotX 30deg   0.025
#     Spine.rotZ 30deg   0.113      L_Arm.rotX 30deg  0.021
#     Spine.locY 0.10    0.075      L_Leg.rotX 30deg  0.013
#
# The arm and leg bones pivot almost on top of their own weighted mass, so even a
# 45deg swing shifts the mesh ~0.02 units — under two pixels at Blobby's on-screen
# size. Any gesture that reads mainly through arms is invisible here; that is why
# the first pass looked inert. So: SPINE ROTATION IS THE PRIMARY CHANNEL for every
# gesture, ROOT TRANSLATION carries bounce (rigid: 0.1 in -> 0.101 mean out, vs
# 0.075 and stretchy for Spine), head adds focus, and arms/legs are accents only.

# Baseline seated pose: legs angled forward over the front of the beanbag and a
# touch of outward splay, so the character reads as sitting rather than hovering.
SEAT_LEG_PITCH = 16.0
SEAT_LEG_SPLAY = 5.0

# +Spine.rotX tips the top of the body toward Blobby's face — i.e. leaning
# FORWARD/hunched. Negative opens the chest and leans back.


def seated_base(arm, lean=0.0, roll=0.0, bounce=0.0, leg_extra=0.0):
    """Apply the shared seated posture; callers then layer arms/head on top.

    `bounce` goes on Root, not Spine. Root translates the character rigidly;
    Spine translation drags the torso away from the Root-parented legs and the
    mesh stretches, which is what made the silhouette morph between frames.
    """
    clear_pose(arm)
    set_bone(arm, "Root", loc=(0, bounce, 0))
    set_bone(arm, "Spine", rot=(lean, 0, roll))
    set_bone(arm, "L_Leg", rot=(SEAT_LEG_PITCH + leg_extra, 0, -SEAT_LEG_SPLAY))
    set_bone(arm, "R_Leg", rot=(SEAT_LEG_PITCH + leg_extra, 0, SEAT_LEG_SPLAY))


def anim_idle(arm, total):
    """Settled and calm. Deliberately the quietest clip — it is the baseline
    everything else is read against, so it stays small and slow."""
    N = 12
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        breath = math.sin(p * math.pi * 4)               # 2 breaths per loop
        shift = math.sin(p * math.pi * 2)                # one slow weight shift
        seated_base(arm, lean=-1 + breath * 2.0, roll=shift * 4.0,
                    bounce=breath * 0.009)
        set_bone(arm, "Head", rot=(-breath * 4, shift * 8, -shift * 4))
        set_bone(arm, "L_Arm", rot=(-breath * 5, 0, 6))
        set_bone(arm, "R_Arm", rot=(-breath * 5, 0, -6))
        key_pose(arm, f)


def anim_happy(arm, total):
    """Bouncing on the springy beanbag, chest open, wagging side to side."""
    N = 16
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        bounce = abs(math.sin(p * math.pi * 2))          # 2 bounces per loop
        wag = math.sin(p * math.pi * 4)
        # Chest opens (leans back) on each bounce; strong side wag for rhythm.
        seated_base(arm, lean=-3 - bounce * 6, roll=wag * 8,
                    bounce=bounce * 0.055, leg_extra=-bounce * 8)
        set_bone(arm, "Head", rot=(-bounce * 7, wag * 9, -wag * 5))
        set_bone(arm, "L_Arm", rot=(-bounce * 22, 0, 14))
        set_bone(arm, "R_Arm", rot=(-bounce * 22, 0, -14))
        key_pose(arm, f)


def anim_celebrating(arm, total):
    """The loudest gesture: big rocking cheer, body thrown back, hard bounces."""
    N = 20
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        bounce = abs(math.sin(p * math.pi * 3))          # 3 bounces
        twist = math.sin(p * math.pi * 4)
        # Amplitudes roughly double `happy` so the two never read as the same clip.
        seated_base(arm, lean=-5 - bounce * 10, roll=twist * 14,
                    bounce=bounce * 0.085, leg_extra=-bounce * 13)
        set_bone(arm, "Head", rot=(-7 - bounce * 10, twist * 13, -twist * 7))
        set_bone(arm, "L_Arm", rot=(-bounce * 32, 0, 24))
        set_bone(arm, "R_Arm", rot=(-bounce * 32, 0, -24))
        key_pose(arm, f)


def anim_worried(arm, total):
    """Hunched and fretting — forward lean plus quick, small nervous shifts."""
    N = 18
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        fidget = math.sin(p * math.pi * 6)               # quick weight shifts
        shake = math.sin(p * math.pi * 8)                # fast little head shake
        seated_base(arm, lean=12 + fidget * 2.0, roll=fidget * 6,
                    bounce=-0.008, leg_extra=4)
        set_bone(arm, "Head", rot=(9, shake * 10, fidget * 4))
        set_bone(arm, "L_Arm", rot=(16, 0, -12))         # drawn in, closed off
        set_bone(arm, "R_Arm", rot=(16, 0, 12))
        key_pose(arm, f)


def anim_sick(arm, total):
    """Heavy and drooping: one slow laboured breath, head lolling to the side."""
    N = 10
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        breath = math.sin(p * math.pi * 2)               # one slow deep breath
        loll = math.sin(p * math.pi * 2)
        seated_base(arm, lean=18 - breath * 3, roll=loll * 9,
                    bounce=-0.018 + breath * 0.010, leg_extra=6)
        set_bone(arm, "Head", rot=(13 + breath * 3, loll * 12, loll * 8))
        set_bone(arm, "L_Arm", rot=(20, 0, -5))          # slack
        set_bone(arm, "R_Arm", rot=(20, 0, 5))
        key_pose(arm, f)


def anim_critical(arm, total):
    """Barely responsive: deep slump, only the faintest shallow breathing.
    Near-stillness is the point — it should look alarming next to `sick`."""
    N = 8
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        breath = math.sin(p * math.pi * 2)
        seated_base(arm, lean=25 - breath * 2.0, roll=5,
                    bounce=-0.032 + breath * 0.006, leg_extra=10)
        set_bone(arm, "Head", rot=(18 + breath * 2, breath * 4, 6))
        set_bone(arm, "L_Arm", rot=(28, 0, -2))
        set_bone(arm, "R_Arm", rot=(28, 0, 2))
        key_pose(arm, f)


def anim_recovering(arm, total):
    """Slumped → straightening → a small hopeful bob. The only clip that reads
    as a one-way journey rather than a cycle."""
    N = 16
    for i in range(N + 1):
        f = round(total * i / N)
        p = i / N
        rise = min(p / 0.7, 1.0)                         # upright by 70% through
        droop = 25 * (1 - rise)
        hop = abs(math.sin((p - 0.7) / 0.3 * math.pi)) if p > 0.7 else 0.0
        seated_base(arm, lean=droop - 3 - hop * 6, roll=4 * (1 - rise),
                    bounce=-0.030 * (1 - rise) + hop * 0.050,
                    leg_extra=9 * (1 - rise) - hop * 10)
        set_bone(arm, "Head", rot=(18 * (1 - rise) - hop * 10, 0, 4 * (1 - rise)))
        set_bone(arm, "L_Arm", rot=(20 * (1 - rise) - hop * 26, 0, -4 + rise * 14))
        set_bone(arm, "R_Arm", rot=(20 * (1 - rise) - hop * 26, 0, 4 - rise * 14))
        key_pose(arm, f)


def anim_walk(arm, total):
    """The one standing clip. Leg swing barely registers on this rig, so the gait
    reads through a side-to-side waddle on the spine plus a per-footfall bob —
    which suits a legless blob better than a humanoid stride anyway."""
    stride = 20                      # frames per full L/R stride pair
    samples = 4                      # keys per stride
    n = int(total / stride * samples)
    for i in range(n + 1):
        f = round(total * i / n) if n else 0
        phase = (i / samples) * math.pi * 2              # one stride = 2π
        swing = math.sin(phase)
        bob = abs(math.cos(phase)) * 0.038               # rises on each footfall
        clear_pose(arm)
        # Waddle: the body rolls toward the planted foot. Bob rides on Root so the
        # whole character rises as one piece instead of stretching at the waist.
        set_bone(arm, "Root", loc=(0, bob, 0))
        set_bone(arm, "Spine", rot=(-4, swing * 4, swing * 9))
        set_bone(arm, "Head", rot=(-3, -swing * 6, -swing * 5))
        set_bone(arm, "L_Arm", rot=(-swing * 24, 0, 12))
        set_bone(arm, "R_Arm", rot=(swing * 24, 0, -12))
        set_bone(arm, "L_Leg", rot=(swing * 30, 0, 0))
        set_bone(arm, "R_Leg", rot=(-swing * 30, 0, 0))
        key_pose(arm, f)


# name → (duration in seconds, builder). Durations match the originals so the
# app's walk/jump/settle timing constants stay valid.
CLIPS = [
    ("idle",            5.00, anim_idle),
    ("happy",           2.50, anim_happy),
    ("celebrating",     3.75, anim_celebrating),
    ("worried",         3.67, anim_worried),
    ("sick",            5.00, anim_sick),
    ("critical",        5.00, anim_critical),
    ("recovering",      6.25, anim_recovering),
    ("walk_to_cushion", 9.96, anim_walk),
]


# ── Pipeline ────────────────────────────────────────────────────────────────
def load_variant(variant):
    """Load a rigged variant GLB into an empty scene; return (armature, mesh)."""
    src = os.path.join(FINAL_DIR, f"blobby-{variant}.glb")
    if not os.path.exists(src):
        raise FileNotFoundError(src)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if arm is None:
        raise RuntimeError(f"{variant}: no armature in {src}")

    # The rig pass left a stray Icosphere in the scene — drop anything that is
    # not the armature or its skinned mesh.
    keep = {arm} | {c for c in arm.children_recursive}
    for obj in list(bpy.data.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)

    mesh = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
    if mesh is None:
        raise RuntimeError(f"{variant}: no mesh in {src}")
    return arm, mesh


def purge_actions():
    """Delete every placeholder action."""
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def build_animations(arm):
    """Author all clips and stack them as NLA tracks so glTF exports each one."""
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')

    built = []
    for name, seconds, builder in CLIPS:
        total = round(seconds * FPS)
        action = new_action(arm, name)
        builder(arm, total)
        smooth_action(action)
        # Report the real key count so a regression back to 2-key stubs is loud.
        n_keys = sum(
            len(fc.keyframe_points)
            for layer in action.layers
            for strip in layer.strips
            for cb in strip.channelbags
            for fc in cb.fcurves
        )
        n_curves = sum(
            len(cb.fcurves)
            for layer in action.layers
            for strip in layer.strips
            for cb in strip.channelbags
        )
        print(f"    {name:16s} {total:4d}f  curves={n_curves:3d}  keys={n_keys:5d}")
        built.append((name, action))

    bpy.ops.object.mode_set(mode='OBJECT')

    # Detach the live action, then push each one onto its own NLA track. The
    # glTF exporter emits one clip per track.
    arm.animation_data.action = None
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)

    for name, action in built:
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(action.frame_range[0]), action)
        strip.name = name
        if len(action.slots):
            try:
                strip.action_slot = action.slots[0]
            except Exception:
                pass
    return built


def export_variant(variant, arm, mesh, out_dir):
    out = os.path.join(out_dir, f"blobby-{variant}.glb")
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm

    bpy.ops.export_scene.gltf(
        filepath=out,
        use_selection=True,
        export_format='GLB',
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_skins=True,
        export_normals=True,
        export_tangents=True,       # False cracks normal maps in three.js
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_texcoords=True,
        export_yup=True,
    )
    print(f"    exported {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    return out


def process(variant, out_dir):
    print(f"\n  === {variant.upper()} ===")
    arm, mesh = load_variant(variant)
    purge_actions()
    build_animations(arm)
    export_variant(variant, arm, mesh, out_dir)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    variants = VARIANTS
    out_dir = FINAL_DIR
    if "--variant" in argv:
        variants = [argv[argv.index("--variant") + 1]]
    if "--out-dir" in argv:
        out_dir = argv[argv.index("--out-dir") + 1]
    os.makedirs(out_dir, exist_ok=True)

    print("=" * 60)
    print("  Blobby Animator — authoring real keyframe animation")
    print(f"  fps={FPS}  variants={variants}")
    print(f"  out={out_dir}")
    print("=" * 60)

    failed = []
    for v in variants:
        try:
            process(v, out_dir)
        except Exception as exc:
            failed.append(v)
            print(f"    FAILED {v}: {exc}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print(f"  done — {len(variants) - len(failed)}/{len(variants)} succeeded")
    if failed:
        print(f"  FAILED: {failed}")
    print("=" * 60)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
