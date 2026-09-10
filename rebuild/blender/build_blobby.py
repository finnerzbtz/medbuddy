"""Recreate the original Blobby from editable surfaces, not an imported mesh.

Blender 5.0+: --background --factory-startup --python build_blobby.py -- --render
Optional: --output /path/to/directory. Outputs include .blend, .glb, and a manifest.
Front = -Y in Blender. Floor = Z 0. Export = Y up, front +Z. Units = metres.
"""
import argparse
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--render', action='store_true')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.actions):
    bpy.data.actions.remove(block)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 97


def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


CHAR = collection('01  BLOBBY · original character')
RIG = collection('02  RIG · pose and animate')
STUDIO = collection('03  STUDIO · render only')
REFERENCE = collection('04  REFERENCE · original artwork')


def move(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def material(name, color, roughness, subsurface=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Subsurface Weight'].default_value = subsurface
    bsdf.inputs['Subsurface Radius'].default_value = (.12, .09, .06)
    return mat


WHITE = material('Warm porcelain · body', (.88, .885, .86), .58, .035)
SHELL = material('Warm porcelain · outer wrap', (.88, .885, .86), .64, .025)
BLACK = material('Polished obsidian · eyes', (.006, .008, .007), .105)
GROUND = material('Studio · warm white', (.91, .915, .90), .8)


def mesh_obj(name, verts, faces, mat, subdivision=2):
    mesh = bpy.data.meshes.new(name + ' · editable surface')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    CHAR.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
    if subdivision:
        sub = obj.modifiers.new('Smooth silhouette · editable cage', 'SUBSURF')
        sub.levels = subdivision
        sub.render_levels = subdivision
    return obj


def signed_power(v, p):
    return math.copysign(abs(v)**p, v)


def egg_radius(z):
    h = max(-1, min(1, (z - 1.145)/.875))
    r = max(0, 1-h*h)**.42
    return .663*r*(1-.045*h), .536*r*(1-.025*h)


# One uninterrupted egg beneath the wrap. Regular quad rings and triangle poles.
segments, rings = 48, 32
verts = [(0, 0, .27)]
for j in range(1, rings):
    t = -math.pi/2 + math.pi*j/rings
    z = 1.145 + .875*math.sin(t)
    rx, ry = egg_radius(z)
    for i in range(segments):
        a = math.tau*i/segments
        verts.append((rx*math.sin(a), -ry*math.cos(a), z))
verts.append((0, 0, 2.02))
faces=[]
for i in range(segments):
    faces.append((0, 1+(i+1)%segments, 1+i))
for j in range(rings-2):
    for i in range(segments):
        a=1+j*segments+i; b=1+j*segments+(i+1)%segments
        faces.append((a, b, b+segments, a+segments))
top=len(verts)-1
for i in range(segments):
    faces.append((top, top-segments+i, top-segments+(i+1)%segments))
body=mesh_obj('Blobby · egg body', verts, faces, WHITE)
body['design_note']='Continuous egg silhouette; no separate head or neck.'

# Distinctive sweeping seam: high at each shoulder, lower in front. The rolled
# edge is geometry, not a drawn line or a texture baked into the character.
verts=[]; faces=[]
levels=[0,.03,.08,.16,.25,.35,.46,.57,.68,.78,.86,.92,.96,.98,1]
for t in levels:
    for i in range(segments):
        a=math.tau*i/segments
        rim=1.435-.245*max(0,math.cos(a))**1.65
        z=.288+(rim-.288)*t
        rx,ry=egg_radius(z)
        thickness=.027+.009*math.sin(math.pi*t)
        # Tiny shoulder lip; the bottom returns smoothly to the underlying body.
        thickness*=min(1, t*9+.15)
        verts.append(((rx+thickness)*math.sin(a),-(ry+thickness)*math.cos(a),z))
for j in range(len(levels)-1):
    for i in range(segments):
        a=j*segments+i;b=j*segments+(i+1)%segments
        faces.append((a,b,b+segments,a+segments))
wrap=mesh_obj('Blobby · curved outer wrap',verts,faces,SHELL)
solid=wrap.modifiers.new('Fine rounded shell rim', 'SOLIDIFY')
solid.thickness=.034
solid.offset=-1
bevel=wrap.modifiers.new('Soft rim edge', 'BEVEL')
bevel.width=.007
bevel.segments=3
wrap['design_note']='Open wrap, with a U-shaped front rim. No mouth in original reference.'


def capsule(name, center, scale, exponent=1, tilt=0, mat=WHITE, seg=32, ring=20):
    verts=[(0,0,-scale[2])]
    for j in range(1,ring):
        latitude=-math.pi/2+math.pi*j/ring
        z=scale[2]*signed_power(math.sin(latitude),exponent)
        radius=math.cos(latitude)**exponent
        for i in range(seg):
            a=i*math.tau/seg
            verts.append((scale[0]*radius*math.sin(a),scale[1]*radius*math.cos(a),z))
    verts.append((0,0,scale[2]))
    # Generate outward winding for x=sin, y=cos parameterization.
    faces=[]
    for i in range(seg): faces.append((0,1+i,1+(i+1)%seg))
    for j in range(ring-2):
        for i in range(seg):
            a=1+j*seg+i;b=1+j*seg+(i+1)%seg
            faces.append((b,a,a+seg,b+seg))
    last=len(verts)-1
    for i in range(seg):faces.append((last,last-seg+(i+1)%seg,last-seg+i))
    transformed=[]
    for x,y,z in verts:
        xx=x*math.cos(tilt)+z*math.sin(tilt)
        zz=-x*math.sin(tilt)+z*math.cos(tilt)
        transformed.append((xx+center[0],y+center[1],zz+center[2]))
    return mesh_obj(name,transformed,faces,mat)


limbs={}
for sign, suffix in [(-1,'L'),(1,'R')]:
    arm=capsule(f'Blobby · flipper arm {suffix}',(sign*.705,-.005,.88),(.143,.184,.32),.92,sign*-.48)
    # In silhouette the arm narrows toward the rounded tip.
    for v in arm.data.vertices:
        factor=.83+.22*min(1,max(0,(v.co.z-.56)/.55))
        v.co.y=-.005+(v.co.y+.005)*factor
    limbs[f'Arm.{suffix}']=arm
    foot=capsule(f'Blobby · short foot {suffix}',(sign*.225,-.004,.205),(.152,.178,.215),.60)
    # A tiny sole keeps both feet precisely grounded, without sphere-point contact.
    for v in foot.data.vertices:
        v.co.z=max(0,v.co.z)
    limbs[f'Foot.{suffix}']=foot


# Glossy inset oval eyes follow the local egg surface normal. Reflections come
# from the actual studio softboxes, so the eyes remain correct from any angle.
eyes={}
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.222;z=1.533
    rx,ry=egg_radius(z)
    y=-ry*math.sqrt(1-(x/rx)**2)
    normal=Vector((x/(rx*rx),y/(ry*ry),.23)).normalized()
    eye=capsule(f'Blobby · black oval eye {suffix}',(0,0,0),(.065,.029,.079),1,mat=BLACK)
    rot=Vector((0,-1,0)).rotation_difference(normal)
    for v in eye.data.vertices:
        v.co=rot@v.co+Vector((x,y-.007,z))
    eyes[f'Eye.{suffix}']=eye


# Match the original's broad, soft silhouette rather than a slender egg.
WIDTH_FACTOR=1.08
for obj in CHAR.objects:
    for v in obj.data.vertices:
        v.co.x*=WIDTH_FACTOR
        v.co.y*=WIDTH_FACTOR

# Rig lives at the feet. Authored animation is the sole owner of bone transforms.
armature=bpy.data.armatures.new('Blobby · skeleton')
rig=bpy.data.objects.new('Blobby_Rig',armature)
RIG.objects.link(rig)
rig.show_in_front=True
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bone_specs=[('Root',(0,0,0),(0,0,.23),None),
 ('Body',(0,0,.28),(0,0,1.10),'Root'),
 ('Head',(0,0,1.10),(0,0,1.90),'Body'),
 ('Arm.L',(-.60,0,1.08),(-.83,0,.62),'Body'),
 ('Arm.R',(.60,0,1.08),(.83,0,.62),'Body'),
 ('Foot.L',(-.225,0,.36),(-.225,0,.06),'Root'),
 ('Foot.R',(.225,0,.36),(.225,0,.06),'Root'),
 ('Eye.L',(-.222,-.49,1.533),(-.222,-.49,1.635),'Head'),
 ('Eye.R',(.222,-.49,1.533),(.222,-.49,1.635),'Head')]
for name,head,tail,parent in bone_specs:
    bone=armature.edit_bones.new(name)
    bone.head=(head[0]*WIDTH_FACTOR,head[1]*WIDTH_FACTOR,head[2])
    bone.tail=(tail[0]*WIDTH_FACTOR,tail[1]*WIDTH_FACTOR,tail[2])
    if parent:bone.parent=armature.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')


def skin(obj,bone=None):
    obj.parent=rig
    groups={name:obj.vertex_groups.new(name=name) for name,*_ in bone_specs}
    for v in obj.data.vertices:
        if bone:
            groups[bone].add([v.index],1,'REPLACE')
        else:
            t=max(0,min(1,(v.co.z-.87)/.65))
            t=t*t*(3-2*t)
            if t<1:groups['Body'].add([v.index],1-t,'REPLACE')
            if t>0:groups['Head'].add([v.index],t,'REPLACE')
    mod=obj.modifiers.new('Deform · Blobby rig','ARMATURE')
    mod.object=rig
    bpy.context.view_layer.objects.active=obj
    # Deform the low-resolution cage, then subdivide.
    while obj.modifiers.find(mod.name)>0:
        bpy.ops.object.modifier_move_up(modifier=mod.name)


skin(body);skin(wrap)
for name,obj in {**limbs,**eyes}.items():skin(obj,name)
CLIPS={'idle':97,'wave':73,'happy':73}
for clip,end in CLIPS.items():
    rig.animation_data_create()
    action=bpy.data.actions.new(clip);action.use_fake_user=True
    rig.animation_data.action=action
    for frame in range(1,end+1,2):
        t=(frame-1)/(end-1)
        for pb in rig.pose.bones:
            pb.rotation_mode='XYZ';pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        breath=math.sin(math.tau*t)
        torso=rig.pose.bones['Body']
        torso.scale=(1-.006*breath,1+.012*breath,1-.006*breath)
        rig.pose.bones['Head'].rotation_euler.z=.012*math.sin(math.tau*t)
        blink=max(0,1-abs(t-.625)/.035)
        if clip=='wave':
            envelope=math.sin(math.pi*t)**.7
            rig.pose.bones['Arm.L'].rotation_euler.z=envelope*(1.10+.20*math.sin(math.tau*t*4))
            rig.pose.bones['Head'].rotation_euler.z=.055*envelope
        elif clip=='happy':
            rig.pose.bones['Root'].location.y=max(0,math.sin(math.tau*t*2))*.15
            for suffix,sign in [('L',1),('R',-1)]:
                rig.pose.bones[f'Arm.{suffix}'].rotation_euler.z=sign*.35*math.sin(math.pi*t)
        for suffix in ['L','R']:
            rig.pose.bones[f'Eye.{suffix}'].scale.y=max(.12,1-.88*blink)
        for pb in rig.pose.bones:
            for channel in ['location','rotation_euler','scale']:
                pb.keyframe_insert(data_path=channel,frame=frame,group=pb.name)
    track=rig.animation_data.nla_tracks.new();track.name=clip
    track.strips.new(clip,1,action);track.mute=True
rig.animation_data.action=None
for pb in rig.pose.bones:
    pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
scene.frame_set(1)


# Export evaluated surface meshes, retaining skin weights and armature. This
# keeps the .blend cages editable while GLB receives the final smooth surface.
bpy.ops.object.select_all(action='DESELECT')
for ob in list(CHAR.objects)+[rig]:ob.select_set(True)
for ob in CHAR.objects:
    for mod in ob.modifiers:
        if mod.type=='SUBSURF':mod.levels=1
bpy.ops.export_scene.gltf(filepath=str(OUT/'blobby.glb'),export_format='GLB',
    use_selection=True,export_apply=True,export_animations=True,
    export_animation_mode='NLA_TRACKS',export_force_sampling=True,
    export_frame_range=False,export_extras=True,export_yup=True,
    export_cameras=False,export_lights=False)
for ob in CHAR.objects:
    for mod in ob.modifiers:
        if mod.type=='SUBSURF':mod.levels=2


def point_at(obj,position):
    obj.rotation_euler=(Vector(position)-obj.location).to_track_quat('-Z','Y').to_euler()


bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004))
ground=bpy.context.object;ground.name='Studio floor · not exported';move(ground,STUDIO);ground.data.materials.append(GROUND)
ground.is_shadow_catcher=True
for name,position,energy,size,color in [
 ('Key · large softbox',(-3,-4,6),260,4,(1,.97,.91)),
 ('Fill · frontal softbox',(4,-2,3.6),47,3,(.92,.96,1)),
 ('Rim · overhead',(1,3,5),130,3,(1,1,1))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='RECTANGLE';data.size=size;data.size_y=size*.7;data.color=color
    light=bpy.data.objects.new(name,data);STUDIO.objects.link(light);light.location=position;point_at(light,(0,0,1))
# A small rectangular card creates the distinctive rectangular eye highlight.
data=bpy.data.lights.new('Eye reflection card','AREA');data.energy=8.3;data.shape='RECTANGLE';data.size=1.0;data.size_y=.35
light=bpy.data.objects.new('Eye reflection card',data);STUDIO.objects.link(light);light.location=(-1,-3,3.2);point_at(light,(0,0,1.5))
camera_data=bpy.data.cameras.new('Portrait camera')
camera=bpy.data.objects.new('Camera · original three-quarter',camera_data);STUDIO.objects.link(camera)
camera_data.type='ORTHO';camera_data.ortho_scale=2.66
camera.location=(-3.4,-7,2.65);point_at(camera,(0,0,1.02));scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.92,.95,1,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.18
scene.view_settings.view_transform='Standard'
scene.view_settings.exposure=0
# A white studio backdrop with real soft contact shadows, without adding
# emissive light to the character. Blender 5 compositor is a node group.
compositor=bpy.data.node_groups.new('White studio · shadow catcher composite','CompositorNodeTree')
compositor.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
render_layer=compositor.nodes.new('CompositorNodeRLayers')
over=compositor.nodes.new('CompositorNodeAlphaOver')
over.inputs['Factor'].default_value=1
over.inputs['Background'].default_value=(1,1,1,1)
output=compositor.nodes.new('NodeGroupOutput')
compositor.links.new(render_layer.outputs['Image'],over.inputs['Foreground'])
compositor.links.new(over.outputs['Image'],output.inputs['Image'])
scene.compositing_node_group=compositor

# Pack the original artwork for side-by-side modelling, if present in the repo.
reference=Path(__file__).resolve().parents[2]/'scripts'/'ref-images'/'base.png'
if reference.exists():
    picture=bpy.data.images.load(str(reference));picture.pack()
    ref=bpy.data.objects.new('Original Blobby · image reference',None)
    REFERENCE.objects.link(ref);ref.empty_display_type='IMAGE';ref.data=picture
    ref.empty_display_size=2.66;ref.location=(2.4,.7,1.02);ref.rotation_euler=(math.pi/2,0,0)
    ref.hide_render=True;ref.hide_set(True)

notes=bpy.data.texts.new('READ ME · Blobby')
notes.write('''BLOBBY — recreated from first principles in Blender

Reference: scripts/ref-images/base.png from the original project.
The previous generated GLB was inspected, never imported into this asset.

Design: white egg silhouette; high wrap sides and low front seam; two glossy
black oval eyes; tapered arms; short feet; no mouth, eyebrows or cheek markings.

Collections: character, rig, studio, packed original reference.
All character parts use editable surface cages and non-destructive modifiers.
Rig: Root, Body, Head, Arm.L/R, Foot.L/R, Eye.L/R.
Three NLA clips: idle (4s), wave (3s), happy (3s). The idle track is enabled.
To preview another clip, mute idle and unmute exactly one chosen NLA track.

Coordinates: metres; floor Z=0; facing -Y; GLB exports Y-up / facing +Z.
App code should place the rig once and let one AnimationMixer own the bones.
No textures, external image files, decoders, or network resources required by GLB.
Studio floor/lights/camera and reference image are excluded from GLB.

To regenerate: Blender --background --factory-startup --python build_blobby.py -- --render
Regeneration replaces generated files. Save manual edits under a different name.
''')

rig.animation_data.nla_tracks[0].mute=False
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.region_3d.view_perspective='CAMERA'
            space.shading.type='MATERIAL'
            space.overlay.show_overlays=False
scene.render.filepath=str(OUT/'blobby-threequarter.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'blobby.blend'))

manifest={
 'name':'Blobby · original recreation','blender':bpy.app.version_string,
 'reference':'scripts/ref-images/base.png','imported_geometry':False,
 'height_metres':2.02,'front_blender':'-Y','up_blender':'Z','front_gltf':'+Z','up_gltf':'Y',
 'meshes':len(CHAR.objects),'base_vertices':sum(len(o.data.vertices) for o in CHAR.objects),
 'bones':[b.name for b in rig.data.bones],
 'clips_seconds':{name:(end-1)/24 for name,end in CLIPS.items()},
 'glb_bytes':(OUT/'blobby.glb').stat().st_size,
}
(OUT/'blobby-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if args.render:
    views={'threequarter':(-3.4,-7,2.65),'front':(0,-8,1.50),'side':(-8,0,1.50),'back':(0,8,1.50)}
    for name,position in views.items():
        camera.location=position;point_at(camera,(0,0,1.02))
        scene.render.filepath=str(OUT/f'blobby-{name}.png')
        bpy.ops.render.render(write_still=True)
    camera.location=views['threequarter'];point_at(camera,(0,0,1.02))
print('BLOBBY_BUILD_OK',json.dumps(manifest))
