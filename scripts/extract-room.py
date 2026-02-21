"""
Extract the Room mesh from the old base GLB (which has the high-quality Meshy AI room)
and export it as a standalone room.glb WITH its node transform baked in.
"""
import bpy
import os

SRC = "/tmp/blobby-base-uncompressed.glb"
DST = "/Users/finnerz/reminduh/assets/final/room.glb"

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Import the old base GLB
bpy.ops.import_scene.gltf(filepath=SRC)

# Find the Room object and keep only it
room = None
to_delete = []
for obj in bpy.data.objects:
    print(f"  Found object: {obj.name} (type={obj.type})")
    if obj.name.startswith("Room"):
        room = obj
    else:
        to_delete.append(obj)

if not room:
    raise RuntimeError("No Room object found in the source GLB!")

# Delete everything except Room
bpy.ops.object.select_all(action='DESELECT')
for obj in to_delete:
    obj.select_set(True)
bpy.ops.object.delete()

# The Room node already has its transform (scale=2.374, pos=[0, 2.158, 0])
# We want to KEEP this transform on the node so Three.js applies it automatically
# when loading, eliminating the need for a wrapper <group> in React.
print(f"Room location: {room.location}")
print(f"Room scale: {room.scale}")
print(f"Room rotation: {room.rotation_euler}")

# Select only Room for export
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)

# Export
bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format='GLB',
    use_selection=True,
    export_apply=False,  # Keep transforms as node transforms
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',  # Keep original texture format
)

print(f"\nExported room to: {DST}")
print(f"Done!")
