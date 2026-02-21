"""
Prepare the high-quality room from the original Meshy AI FBX source.

Takes the FBX + separate PNG textures, builds a proper PBR material,
applies the scene transform, decimates, and exports with quality WebP textures.
"""
import bpy
import os
from mathutils import Vector

FBX_DIR = "/Users/finnerz/Downloads/Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture_fbx"
FBX_FILE = os.path.join(FBX_DIR, "Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture.fbx")
TEX_BASE   = os.path.join(FBX_DIR, "Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture.png")
TEX_NORMAL = os.path.join(FBX_DIR, "Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture_normal.png")
TEX_METAL  = os.path.join(FBX_DIR, "Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture_metallic.png")
TEX_ROUGH  = os.path.join(FBX_DIR, "Meshy_AI_Moon_Window_Zen_Nook_0220125740_texture_roughness.png")

OUTPUT = "/Users/finnerz/reminduh/assets/final/room.glb"

ROOM_SCALE = 2.374312400817871
ROOM_POS_Z = 2.15754771232605
TARGET_FACES = 100_000

# ---------------------------------------------------------------------------
# 1. Clear scene
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ---------------------------------------------------------------------------
# 2. Import FBX
# ---------------------------------------------------------------------------
print(f"Importing FBX...")
bpy.ops.import_scene.fbx(filepath=FBX_FILE)

room = None
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        room = obj
    else:
        bpy.data.objects.remove(obj, do_unlink=True)

if not room:
    raise RuntimeError("No mesh found in FBX!")

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = room
room.select_set(True)

print(f"  Mesh: {room.name}, verts={len(room.data.vertices)}, faces={len(room.data.polygons)}")

# ---------------------------------------------------------------------------
# 3. Build proper PBR material from the separate PNG textures
# ---------------------------------------------------------------------------
print("Building PBR material from PNG textures...")

# Remove existing materials
room.data.materials.clear()

mat = bpy.data.materials.new(name="Room_PBR")
mat.use_nodes = True
mat.use_backface_culling = False  # doubleSided

tree = mat.node_tree
nodes = tree.nodes
links = tree.links

# Clear default nodes
for node in list(nodes):
    nodes.remove(node)

# Create output + principled BSDF
output = nodes.new('ShaderNodeOutputMaterial')
output.location = (400, 0)

bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# Base Color texture
if os.path.exists(TEX_BASE):
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.location = (-500, 300)
    tex_base.image = bpy.data.images.load(TEX_BASE)
    tex_base.image.colorspace_settings.name = 'sRGB'
    links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])
    print(f"  Base color: {TEX_BASE}")
else:
    print(f"  WARNING: Base color texture not found!")

# Normal map
if os.path.exists(TEX_NORMAL):
    tex_normal = nodes.new('ShaderNodeTexImage')
    tex_normal.location = (-500, -100)
    tex_normal.image = bpy.data.images.load(TEX_NORMAL)
    tex_normal.image.colorspace_settings.name = 'Non-Color'

    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.location = (-200, -100)
    links.new(tex_normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    print(f"  Normal: {TEX_NORMAL}")

# Metallic
if os.path.exists(TEX_METAL):
    tex_metal = nodes.new('ShaderNodeTexImage')
    tex_metal.location = (-500, -400)
    tex_metal.image = bpy.data.images.load(TEX_METAL)
    tex_metal.image.colorspace_settings.name = 'Non-Color'
    links.new(tex_metal.outputs['Color'], bsdf.inputs['Metallic'])
    print(f"  Metallic: {TEX_METAL}")

# Roughness
if os.path.exists(TEX_ROUGH):
    tex_rough = nodes.new('ShaderNodeTexImage')
    tex_rough.location = (-500, -600)
    tex_rough.image = bpy.data.images.load(TEX_ROUGH)
    tex_rough.image.colorspace_settings.name = 'Non-Color'
    links.new(tex_rough.outputs['Color'], bsdf.inputs['Roughness'])
    print(f"  Roughness: {TEX_ROUGH}")

# Assign material
room.data.materials.append(mat)

# ---------------------------------------------------------------------------
# 4. Apply scene transform
# ---------------------------------------------------------------------------
room.scale = Vector((ROOM_SCALE, ROOM_SCALE, ROOM_SCALE))
room.location.z = ROOM_POS_Z
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mins = Vector((float('inf'),) * 3)
maxs = Vector((float('-inf'),) * 3)
for v in room.data.vertices:
    co = room.matrix_world @ v.co
    mins = Vector((min(mins[i], co[i]) for i in range(3)))
    maxs = Vector((max(maxs[i], co[i]) for i in range(3)))
print(f"  Bounds: ({mins.x:.3f}, {mins.y:.3f}, {mins.z:.3f}) to ({maxs.x:.3f}, {maxs.y:.3f}, {maxs.z:.3f})")

# ---------------------------------------------------------------------------
# 5. Decimate
# ---------------------------------------------------------------------------
face_count = len(room.data.polygons)
print(f"  Faces: {face_count}")

if face_count > TARGET_FACES:
    ratio = TARGET_FACES / face_count
    print(f"  Decimating to ~{TARGET_FACES} (ratio: {ratio:.4f})")
    mod = room.modifiers.new(name="Decimate", type='DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f"  After: {len(room.data.polygons)} faces, {len(room.data.vertices)} verts")

# ---------------------------------------------------------------------------
# 6. Clean normals + smooth shading
# ---------------------------------------------------------------------------
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

room.name = "Room"
room.data.name = "Room"

# ---------------------------------------------------------------------------
# 7. Export
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)

print(f"\nExporting to {OUTPUT}...")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='WEBP',
    export_image_quality=95,
)

print("Done!")
