"""
Blender Python script: Rig all 4 Blobby variants
Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/rig-blobbys.py

Pipeline per variant:
  1. Import raw GLB from Meshy
  2. Scale & center mesh to match original Blobby size
  3. Decimate to ~25K faces for web performance
  4. Create 7-bone armature (Root, Spine, Head, L_Arm, R_Arm, L_Leg, R_Leg)
  5. Parent mesh to armature with automatic weights
  6. Import room from original base GLB
  7. Import all 32 animations from original base GLB
  8. Export final GLB
"""

import bpy
import bmesh
import os
import sys
import math
from mathutils import Vector, Quaternion, Matrix

# ── Config ──────────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
# Use decompressed version (meshopt-compressed GLBs can't be imported by Blender)
OLD_BASE_GLB = "/tmp/blobby-base-uncompressed.glb"

VARIANTS = ["base", "raincoat", "sweater", "glasses"]

# Target mesh size (matching the old rigged blobby)
TARGET_SIZE_X = 0.774  # width of original blobby mesh

# Target face count for web
TARGET_FACES = 25000

# Bone data from the original rig (exact values)
BONES = {
    "Root": {
        "parent": None,
        "head": Vector((0, 0, -0.35)),
        "tail": Vector((0, 0, -0.10)),  # toward Spine
    },
    "Spine": {
        "parent": "Root",
        "head": Vector((0, 0, -0.10)),
        "tail": Vector((0, 0, 0.15)),   # toward Head
    },
    "Head": {
        "parent": "Spine",
        "head": Vector((0, 0, 0.15)),
        "tail": Vector((0, 0, 0.40)),
    },
    "L_Arm": {
        "parent": "Spine",
        "head": Vector((-0.22, 0, 0.05)),
        "tail": Vector((-0.50, 0, 0.05)),
    },
    "R_Arm": {
        "parent": "Spine",
        "head": Vector((0.22, 0, 0.05)),
        "tail": Vector((0.50, 0, 0.05)),
    },
    "L_Leg": {
        "parent": "Root",
        "head": Vector((-0.12, 0, -0.30)),
        "tail": Vector((-0.12, 0, -0.55)),
    },
    "R_Leg": {
        "parent": "Root",
        "head": Vector((0.12, 0, -0.30)),
        "tail": Vector((0.12, 0, -0.55)),
    },
}

# Blender uses Z-up, glTF uses Y-up. Blender's glTF importer handles the
# conversion automatically, so bone positions here are in Blender's Z-up space.
# The original GLB bone translations (Y-up) map as:
#   glTF(x, y, z) -> Blender(x, z, -y)
# But since we import/export through glTF, Blender handles this.
# We define bones in Blender's coordinate system.


def clear_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    # Also remove orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.images:
        if block.users == 0:
            bpy.data.images.remove(block)
    for block in bpy.data.actions:
        if block.users == 0:
            bpy.data.actions.remove(block)


def import_glb(filepath):
    """Import a GLB file and return the imported objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=filepath)
    after = set(bpy.data.objects)
    return list(after - before)


def find_mesh_objects(objects):
    """Find mesh objects from a list of objects."""
    meshes = []
    for obj in objects:
        if obj.type == 'MESH':
            meshes.append(obj)
        # Also check children
        for child in obj.children_recursive:
            if child.type == 'MESH':
                meshes.append(child)
    return meshes


def get_bounding_box(obj):
    """Get world-space bounding box of a mesh object."""
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    mins = Vector((min(v.x for v in bbox), min(v.y for v in bbox), min(v.z for v in bbox)))
    maxs = Vector((max(v.x for v in bbox), max(v.y for v in bbox), max(v.z for v in bbox)))
    return mins, maxs


def process_raw_mesh(obj, variant_name):
    """Scale, center, and decimate the raw mesh."""
    # Make sure we're working with just this object
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # Apply any transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Get current size
    mins, maxs = get_bounding_box(obj)
    current_size = maxs - mins
    print(f"  Raw mesh size: {current_size.x:.3f} x {current_size.y:.3f} x {current_size.z:.3f}")

    # The original Blobby mesh in Blender Z-up space has bounds roughly:
    #   X: -0.389 to 0.385 (width 0.774)
    #   Y: -0.322 to 0.286 (depth 0.608)
    #   Z: -0.388 to 0.426 (height 0.814)   <-- this is the key dimension
    # Bones span: Root Z=-0.35, Head top Z=+0.40 (range 0.75)
    # We need to scale so the mesh height (Z in Blender) matches ~0.814
    TARGET_HEIGHT_Z = 0.814
    scale_factor = TARGET_HEIGHT_Z / current_size.z
    obj.scale = Vector((scale_factor, scale_factor, scale_factor))
    bpy.ops.object.transform_apply(scale=True)

    # Center at origin
    mins, maxs = get_bounding_box(obj)
    center = (mins + maxs) / 2
    obj.location.x -= center.x
    obj.location.y -= center.y
    obj.location.z -= center.z
    bpy.ops.object.transform_apply(location=True)

    mins, maxs = get_bounding_box(obj)
    print(f"  Scaled mesh size: {(maxs-mins).x:.3f} x {(maxs-mins).y:.3f} x {(maxs-mins).z:.3f}")
    print(f"  Bounds: ({mins.x:.3f}, {mins.y:.3f}, {mins.z:.3f}) to ({maxs.x:.3f}, {maxs.y:.3f}, {maxs.z:.3f})")

    # Decimate if needed
    face_count = len(obj.data.polygons)
    print(f"  Face count: {face_count}")

    if face_count > TARGET_FACES:
        ratio = TARGET_FACES / face_count
        print(f"  Decimating: {face_count} -> ~{TARGET_FACES} faces (ratio: {ratio:.4f})")

        mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

        face_count = len(obj.data.polygons)
        print(f"  After decimate: {face_count} faces")

    # Recalculate normals
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Smooth shading
    bpy.ops.object.shade_smooth()

    # Rename
    obj.name = f"Blobby_{variant_name.capitalize()}"
    obj.data.name = f"Blobby_{variant_name.capitalize()}"

    return obj


def create_armature(variant_name):
    """Create the 7-bone armature matching the original rig."""
    armature_name = f"Blobby_{variant_name.capitalize()}_Armature"

    # Create armature data
    arm_data = bpy.data.armatures.new(name=armature_name)
    arm_obj = bpy.data.objects.new(name=armature_name, object_data=arm_data)

    # Link to scene
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)

    # Enter edit mode to create bones
    bpy.ops.object.mode_set(mode='EDIT')

    for bone_name, bone_data in BONES.items():
        bone = arm_data.edit_bones.new(bone_name)
        bone.head = bone_data["head"]
        bone.tail = bone_data["tail"]

        if bone_data["parent"]:
            bone.parent = arm_data.edit_bones[bone_data["parent"]]

        # Keep connected = False so each bone has independent position
        bone.use_connect = False

    bpy.ops.object.mode_set(mode='OBJECT')

    print(f"  Created armature '{armature_name}' with {len(arm_data.bones)} bones")
    return arm_obj


def parent_mesh_to_armature(mesh_obj, arm_obj):
    """Parent mesh to armature with automatic weights, fallback to manual."""
    bpy.ops.object.select_all(action='DESELECT')

    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj

    # Try automatic weights first
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    # Check if skinning actually worked by verifying vertex groups have weights
    has_weights = False
    for vg in mesh_obj.vertex_groups:
        # Sample a few vertices
        for vi in range(min(100, len(mesh_obj.data.vertices))):
            try:
                w = vg.weight(vi)
                if w > 0:
                    has_weights = True
                    break
            except RuntimeError:
                continue
        if has_weights:
            break

    if has_weights:
        print(f"  Auto-weights succeeded")
    else:
        print(f"  Auto-weights produced no weights, applying manual distance-based weights...")
        assign_manual_weights(mesh_obj, arm_obj)

    # Verify vertex groups
    groups = [vg.name for vg in mesh_obj.vertex_groups]
    print(f"  Vertex groups: {groups}")

    # Verify skin modifier exists
    has_armature_mod = any(m.type == 'ARMATURE' for m in mesh_obj.modifiers)
    print(f"  Armature modifier: {'YES' if has_armature_mod else 'NO'}")

    return mesh_obj


def assign_manual_weights(mesh_obj, arm_obj):
    """Manually assign vertex weights based on distance to bones."""
    import numpy as np

    # Get bone head positions in world space
    bone_positions = {}
    for bone in arm_obj.data.bones:
        # Head position in armature local space (which is world since armature is at origin)
        bone_positions[bone.name] = arm_obj.matrix_world @ bone.head_local

    # Ensure vertex groups exist
    for bone_name in bone_positions:
        if bone_name not in mesh_obj.vertex_groups:
            mesh_obj.vertex_groups.new(name=bone_name)

    # For each vertex, compute distance to each bone and assign weights
    for v in mesh_obj.data.vertices:
        v_pos = mesh_obj.matrix_world @ v.co
        distances = {}
        for bone_name, bone_pos in bone_positions.items():
            dist = (v_pos - bone_pos).length
            distances[bone_name] = dist

        # Convert distances to weights (inverse distance, normalized)
        min_dist = min(distances.values())
        max_dist = max(distances.values())

        weights = {}
        total = 0
        for bone_name, dist in distances.items():
            # Inverse distance with falloff
            w = 1.0 / (dist + 0.01) ** 2
            weights[bone_name] = w
            total += w

        # Normalize and assign
        for bone_name, w in weights.items():
            normalized_w = w / total
            if normalized_w > 0.01:  # Only assign meaningful weights
                vg = mesh_obj.vertex_groups[bone_name]
                vg.add([v.index], normalized_w, 'REPLACE')

    print(f"  Manual weights assigned to {len(mesh_obj.data.vertices)} vertices")


def import_animations():
    """Import animations from the original base GLB (no room)."""
    print("\n  Importing animations from original base GLB...")

    imported = import_glb(OLD_BASE_GLB)

    animations = []

    # Collect all animation actions
    for action in bpy.data.actions:
        animations.append(action)

    # Remove ALL imported objects (we only want the actions)
    # Collect all objects to remove, then delete deepest-children first
    to_remove = set()
    for obj in imported:
        to_remove.add(obj)
        for child in obj.children_recursive:
            to_remove.add(child)
    # Sort by depth (deepest first) to avoid dangling references
    def _depth(o):
        d = 0
        p = o.parent
        while p:
            d += 1
            p = p.parent
        return d
    for obj in sorted(to_remove, key=_depth, reverse=True):
        try:
            bpy.data.objects.remove(obj, do_unlink=True)
        except ReferenceError:
            pass  # already removed

    print(f"  Animations found: {len(animations)}")
    for a in animations[:8]:
        print(f"    - {a.name}")

    return animations


def apply_animations_to_armature(arm_obj, animations, variant_name):
    """Apply animation actions to the new armature."""
    # The animations reference bone names like "Root", "Spine", etc.
    # which match our new armature, so they should work directly.

    # Filter to relevant animations (those without variant suffix, or matching this variant)
    base_anim_names = ["idle", "happy", "celebrating", "worried", "sick",
                       "critical", "recovering", "walk_to_cushion"]

    applied_count = 0
    for action in animations:
        # Keep all animation variants
        arm_obj.animation_data_create()
        # The actions are stored globally, they'll export with the armature
        applied_count += 1

    print(f"  {applied_count} animations available for export")
    return applied_count


def export_variant(variant_name, arm_obj, mesh_obj):
    """Export the rigged variant as GLB (character only, no room)."""
    output_path = os.path.join(MODELS_DIR, f"blobby-{variant_name}.glb")

    # Select only armature + mesh (no room)
    bpy.ops.object.select_all(action='DESELECT')
    arm_obj.select_set(True)
    mesh_obj.select_set(True)

    # Export
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        use_selection=True,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_normals=True,
        export_tangents=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_texcoords=True,
        export_yup=True,
    )

    file_size = os.path.getsize(output_path) / 1024
    print(f"  Exported: {output_path} ({file_size:.0f} KB)")
    return output_path


def process_variant(variant_name):
    """Full pipeline for a single variant."""
    print(f"\n{'='*60}")
    print(f"  Processing: {variant_name.upper()}")
    print(f"{'='*60}")

    raw_glb = os.path.join(MODELS_DIR, f"blobby-{variant_name}-raw.glb")
    if not os.path.exists(raw_glb):
        print(f"  ERROR: Raw GLB not found: {raw_glb}")
        return False

    # Clear scene
    clear_scene()

    # Step 1: Import raw mesh
    print(f"\n  Step 1: Importing raw mesh...")
    imported = import_glb(raw_glb)
    mesh_objects = find_mesh_objects(imported)

    if not mesh_objects:
        print(f"  ERROR: No mesh objects found in {raw_glb}")
        return False

    # Use the first/main mesh, remove others
    mesh_obj = mesh_objects[0]
    print(f"  Imported mesh: {mesh_obj.name}")

    # Remove any non-mesh or extra objects
    for obj in imported:
        if obj != mesh_obj and obj not in mesh_obj.children_recursive:
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except:
                pass

    # Step 2: Process mesh (scale, center, decimate)
    print(f"\n  Step 2: Processing mesh...")
    mesh_obj = process_raw_mesh(mesh_obj, variant_name)

    # Step 3: Create armature
    print(f"\n  Step 3: Creating armature...")
    arm_obj = create_armature(variant_name)

    # Step 4: Parent with automatic weights
    print(f"\n  Step 4: Rigging...")
    parent_mesh_to_armature(mesh_obj, arm_obj)

    # Step 5: Import animations (room is loaded separately in the app)
    print(f"\n  Step 5: Importing animations...")
    animations = import_animations()

    # Step 6: Apply animations
    print(f"\n  Step 6: Setting up animations...")
    # Assign all actions to the armature so they export
    if arm_obj.animation_data is None:
        arm_obj.animation_data_create()

    # In Blender 5.0+, actions use "slots" to bind to objects.
    # We need to create a slot for our armature in each action,
    # then assign it to the NLA strip.
    for i, action in enumerate(animations):
        # Create or find a slot targeting our armature
        slot = None
        # Try to add a slot for our armature
        try:
            slot = action.slots.new(id_type='OBJECT', name=arm_obj.name)
        except Exception:
            # Might already have one, or API differs
            for s in action.slots:
                slot = s
                break

        track = arm_obj.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.name = action.name

        # Assign the slot to the strip
        if slot is not None:
            try:
                strip.action_slot = slot
            except Exception:
                pass  # Older Blender or different API

    print(f"  Set up {len(animations)} animation tracks")

    # Step 7: Export
    print(f"\n  Step 7: Exporting...")
    export_variant(variant_name, arm_obj, mesh_obj)

    print(f"\n  {variant_name} COMPLETE!")
    return True


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    print("="*60)
    print("  Blobby Rigger — Blender Automation Script")
    print("="*60)

    # Check that required files exist
    if not os.path.exists(OLD_BASE_GLB):
        print(f"ERROR: Original base GLB not found: {OLD_BASE_GLB}")
        sys.exit(1)

    for v in VARIANTS:
        raw = os.path.join(MODELS_DIR, f"blobby-{v}-raw.glb")
        if not os.path.exists(raw):
            print(f"WARNING: Raw GLB missing for {v}: {raw}")

    results = {}
    for variant in VARIANTS:
        try:
            success = process_variant(variant)
            results[variant] = "OK" if success else "FAILED"
        except Exception as e:
            print(f"\n  ERROR processing {variant}: {e}")
            import traceback
            traceback.print_exc()
            results[variant] = f"ERROR: {e}"

    # Summary
    print("\n\n" + "="*60)
    print("  SUMMARY")
    print("="*60)
    for v, status in results.items():
        icon = "+" if status == "OK" else "X"
        print(f"  [{icon}] {v}: {status}")

    # List output files
    print("\nOutput files:")
    for f in sorted(os.listdir(MODELS_DIR)):
        if f.startswith("blobby-") and f.endswith(".glb") and "-raw" not in f:
            size = os.path.getsize(os.path.join(MODELS_DIR, f)) / 1024
            print(f"  {f} ({size:.0f} KB)")


if __name__ == "__main__":
    main()
