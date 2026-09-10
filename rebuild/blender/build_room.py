"""Reminduh's editable, deterministic Blender source. No imported meshes or textures.

Run: Blender --background --factory-startup --python rebuild/blender/build_room.py
Add -- --render to produce the room portrait and the offline fallback image.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'generated'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.actions):
    bpy.data.actions.remove(data)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 97


def collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


ROOM = collection('01 · Room architecture')
FURNITURE = collection('02 · Furniture and garden')
CHAR = collection('03 · Blobby and rig')
STUDIO = collection('04 · Lighting and cameras')


def move(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def material(name, color, rough=.55, metal=0, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if glow:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = glow
    return m


cream = material('Plaster · warm chalk', (.81, .77, .65))
wood = material('Oak · honey', (.52, .32, .16))
wood_light = material('Oak · cut edges', (.69, .47, .27))
sage = material('Tatami · sage', (.36, .44, .27), .9)
sage_light = material('Tatami · alternate', (.42, .49, .31), .9)
seam = material('Tatami · edging', (.20, .26, .15))
cloth = material('Linen · oat', (.71, .58, .40), .95)
clay = material('Ceramic · terracotta', (.48, .23, .13))
soil = material('Soil', (.095, .065, .04))
green = material('Leaves · moss', (.18, .30, .105))
green_light = material('Leaves · new growth', (.34, .45, .16))
sky = material('Window · soft sky', (.44, .64, .65), glow=.2)
hill = material('Window · distant hills', (.22, .40, .32))
sun = material('Window · morning sun', (1, .75, .37), glow=.5)
moon = material('Window · moonlight', (.69, .81, 1), glow=1.3)
bedding = material('Bed · lavender linen', (.43, .43, .62), .95)
pillow = material('Bed · cloud cotton', (.85, .78, .66), .98)
ivory = material('Blobby · vanilla', (.92, .83, .64), .4)
ink = material('Blobby · espresso eyes', (.045, .033, .026), .23)
blush = material('Blobby · peach cheeks', (.85, .34, .23))
white = material('Blobby · catchlights', (1, .98, .90), .2)
amber = material('Raincoat · marigold', (.84, .44, .07), .45)
knit = material('Sweater · dusty sage', (.24, .37, .28), .95)


def finish(obj, name, mat, col, smooth=False):
    obj.name = name
    move(obj, col)
    if mat:
        obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def cube(name, loc, size, mat, col=ROOM, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(ob, name, mat, col)
    if bevel:
        mod = ob.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        ob.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return ob


def uv(name, loc, size, mat, col=FURNITURE, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    ob = bpy.context.object
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, name, mat, col, True)


def cyl(name, loc, radius, depth, mat, col=FURNITURE, vertices=40, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                  radius2=radius if top is None else top, depth=depth, location=loc)
    ob = finish(bpy.context.object, name, mat, col, True)
    mod = ob.modifiers.new('Edge softness', 'BEVEL')
    mod.width = .015
    mod.segments = 2
    ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob


def path(name, points, radius, mat, col=FURNITURE, closed=False):
    crv = bpy.data.curves.new(name, 'CURVE')
    crv.dimensions = '3D'
    crv.resolution_u = 2
    crv.bevel_depth = radius
    crv.bevel_resolution = 1
    spl = crv.splines.new('POLY')
    spl.points.add(len(points) - 1)
    for p, xyz in zip(spl.points, points):
        p.co = (*xyz, 1)
    spl.use_cyclic_u = closed
    ob = bpy.data.objects.new(name, crv)
    col.objects.link(ob)
    crv.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return ob


# Floor surface is exactly z=0. Assets never guess their own placement.
cube('Foundation', (0, 0, -.14), (4.6, 4.0, .28), wood_light, bevel=.07)
cube('Tatami backing', (0, 0, -.023), (4.4, 3.8, .03), seam, bevel=0)
for row in range(3):
    for col in range(3):
        cube(f'Tatami_{row}_{col}', (-1.46 + col*1.46, -1.26 + row*1.26, -.006),
             (1.425, 1.225, .028), sage if (row+col)%2 else sage_light, bevel=.009)
        # Fine, real geometry weave strips are portable to glTF.
        for line in range(18):
            y = -1.26 + row*1.26 - .57 + line*.065
            cube(f'Weave_{row}_{col}_{line}', (-1.46+col*1.46, y, .01),
                 (1.39, .005, .002), sage_light if (row+col)%2 else sage, bevel=0)

cube('Wall_left', (-2.22, .02, 1.53), (.15, 3.98, 3.10), cream)
wall = cube('Wall_window', (.015, 1.925, 1.53), (4.59, .15, 3.1), cream)
# A real opening, with editable Boolean retained in the .blend.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.86, depth=.5,
                                  location=(.36, 1.925, 1.96), rotation=(math.pi/2, 0, 0))
cutter = finish(bpy.context.object, 'Window_opening_tool', None, ROOM)
cutter.hide_render = True
cutter.hide_set(True)
cutter.display_type = 'WIRE'
boolean = wall.modifiers.new('Round window opening', 'BOOLEAN')
boolean.object = cutter
boolean.operation = 'DIFFERENCE'
# Move Boolean before bevel.
bpy.context.view_layer.objects.active = wall
bpy.ops.object.modifier_move_up(modifier=boolean.name)
bpy.ops.object.modifier_move_up(modifier=boolean.name)
for radius, y, thickness in [(.88, 1.83, .052), (.855, 1.98, .03)]:
    path('Oak circular window frame', [(.36+radius*math.cos(a*math.tau/96), y, 1.96+radius*math.sin(a*math.tau/96)) for a in range(96)], thickness, wood_light, ROOM, True)
backdrop = cyl('Garden sky', (.36, 2.10, 1.96), 1.0, .035, sky, ROOM, 96)
backdrop.rotation_euler.x = math.pi/2
uv('Distant hill left', (-.02, 2.06, 1.51), (.66, .055, .30), hill)
uv('Distant hill right', (.78, 2.045, 1.43), (.60, .06, .30), green)
uv('Morning sun', (.66, 2.05, 2.24), (.14, .025, .14), sun)
# Separate celestial groups let the local clock change the window without textures.
# A slender crescent, built as a closed ribbon in the window plane.
verts=[]; faces=[]; steps=32
for i in range(steps+1):
    a=-math.pi/2+i*math.pi/steps
    z=2.24+.16*math.sin(a)
    verts.extend([(.66-.16*math.cos(a),2.035,z),(.66-.085*math.cos(a),2.035,z)])
for i in range(steps): faces.append((i*2,i*2+1,i*2+3,i*2+2))
mesh=bpy.data.meshes.new('Moon crescent');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new('Night moon',mesh);FURNITURE.objects.link(ob);mesh.materials.append(moon)
moon.use_nodes=True;moon.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9
for i,(x,z,r) in enumerate([(-.10,2.48,.019),(.26,2.62,.014),(.89,2.50,.017),(.14,2.28,.011),(.91,1.96,.015),(-.28,2.11,.012)]):
    uv('Night star '+str(i),(x,2.035,z),(r,.008,r),moon,segments=8,rings=4)

for x, height in [(-.22, .74), (-.03, 1.01), (.12, .6)]:
    path('Bamboo stem', [(x, 2.015, 1.34), (x+.025, 2.015, 1.34+height)], .009, green)
    for j in range(3):
        z = 1.51+j*.19
        for sign in [-1, 1]:
            leaf = uv('Bamboo leaf', (x+sign*.085, 1.997, z+.04), (.105, .018, .024), green_light, segments=16, rings=8)
            leaf.rotation_euler.y = sign*-.55
cube('Long window shelf', (-.55, 1.64, .82), (1.84, .46, .12), wood_light, FURNITURE)
cube('Left skirting', (-2.12, 0, .09), (.045, 3.78, .18), wood_light)
cube('Back skirting', (0, 1.82, .09), (4.35, .045, .18), wood_light)
cube('Wall corner cap',(-2.22,1.925,3.045),(.17,.17,.075),cream,ROOM,.012)

# Furniture: purpose-built objects with readable names and geometry.
cube('Bonsai pedestal', (-1.65, 1.23, .33), (.58, .60, .66), wood_light, FURNITURE, .035)
cyl('Bonsai pot', (-1.65, 1.23, .74), .24, .17, clay, top=.28)
cyl('Bonsai soil', (-1.65, 1.23, .824), .251, .012, soil)
path('Bonsai trunk', [(-1.65, 1.23, .82), (-1.7,1.23,1.02), (-1.57,1.22,1.23), (-1.60,1.24,1.44)], .041, wood)
for i, (dx, dy, z, size) in enumerate([(-.19, 0, 1.17, .22), (.18,.02,1.30,.23), (-.11,-.03,1.48,.25), (.13,.01,1.54,.2)]):
    path('Bonsai branch', [(-1.61, 1.23, z-.17), (-1.65+dx,1.23+dy,z)], .017, wood)
    for j in range(5):
        a=j*math.tau/5
        uv(f'Bonsai crown {i}-{j}',(-1.65+dx+math.cos(a)*.085,1.23+dy+math.sin(a)*.085,z), (size*.75,size*.65,size*.47), green if j%2 else green_light, segments=16, rings=8)

cube('Tea table top', (-.93, -.47, .48), (1.16,.76,.095), wood_light, FURNITURE, .065)
for x in [-1.36,-.50]:
    for y in [-.71,-.23]:
        cube('Tea table leg', (x,y,.225), (.08,.08,.45), wood, FURNITURE, .018)
# The reachable cup has an actual hollow rim; the saucer remains on the table.
cyl('Cup saucer', (-.99,-.70,.543), .13,.017,cream)
profiles=[(.056,.55),(.074,.556),(.087,.642),(.086,.652),(.077,.65),(.064,.571),(.012,.565)]
verts=[];faces=[];segments=40
for radius,z in profiles:
    for i in range(segments):
        a=i*math.tau/segments;verts.append((-.99+radius*math.cos(a),-.70+radius*math.sin(a),z))
for row in range(len(profiles)-1):
    for i in range(segments):
        j=(i+1)%segments;faces.append((row*segments+i,row*segments+j,(row+1)*segments+j,(row+1)*segments+i))
mesh=bpy.data.meshes.new('Tea cup · hollow profile');mesh.from_pydata(verts,[],faces);mesh.update()
cup=bpy.data.objects.new('Tea cup',mesh);FURNITURE.objects.link(cup);finish(cup,'Tea cup',cream,FURNITURE,True)
cyl('Tea surface', (-.99,-.70,.635), .072,.003,wood)
path('Cup handle', [(-.90+math.cos(a*math.tau/24)*.045,-.70,.60+math.sin(a*math.tau/24)*.041) for a in range(24)],.012,cream,closed=True)
cube('Book bottom', (-.69,-.56,.55), (.23,.29,.04), knit, FURNITURE, .008)
cube('Book pages', (-.69,-.56,.578), (.215,.276,.022), cream, FURNITURE, .002)

uv('Cushion', (1.07,-.76,.16), (.74,.61,.19), cloth)
path('Cushion welt',[(1.07+.71*math.cos(a*math.tau/96),-.76+.59*math.sin(a*math.tau/96),.16) for a in range(96)], .012, wood_light, closed=True)
for i in range(24):
    a=i*math.tau/24
    path('Cushion stitch',[(1.07+r*math.cos(a),-.76+r*.82*math.sin(a),.16+.184*math.sqrt(max(0,1-(r/.74)**2))) for r in [.38,.45,.52,.59,.65,.69]],.0035,wood_light)
cube('Lamp bedside stand',(2.02,1.52,.38),(.34,.42,.76),wood_light,FURNITURE,.035)
cyl('Lamp base', (2.02,1.52,.786), .15,.055,wood)
uv('Lamp globe', (2.02,1.52,.95), (.14,.14,.16), material('Lamp · glowing porcelain',(1,.76,.39),glow=1.4))
for i in range(3):
    uv('River stone', (-.23+i*.04,1.64,.895+i*.035), (.105-i*.022,.07-i*.01,.025), soil, segments=20, rings=10)

# Low bed: open sightlines, a rounded oak frame and soft, washable-looking linens.
cube('Bed oak platform',(1.20,1.02,.13),(1.24,1.52,.18),wood_light,FURNITURE,.07)
cube('Bed mattress',(1.20,1.02,.255),(1.14,1.42,.17),pillow,FURNITURE,.08)
cube('Bed quilt',(1.20,.81,.345),(1.15,.97,.12),bedding,FURNITURE,.06)
cube('Bed folded hem',(1.20,1.25,.405),(1.14,.15,.045),cloth,FURNITURE,.02)
uv('Bed pillow',(1.20,1.55,.425),(.48,.24,.105),pillow,segments=24,rings=12)
cube('Bed low headboard',(1.20,1.79,.37),(1.26,.08,.52),wood_light,FURNITURE,.04)
for x in [.69,1.71]:
    for y in [.40,1.63]: cube('Bed foot',(x,y,.045),(.11,.12,.09),wood,FURNITURE,.02)
# A separate curved cover is raised only when Blobby is tucked in.
verts=[];faces=[];nx=20;ny=12
for j in range(ny+1):
    v=j/ny
    y=.24+v*.70
    for i in range(nx+1):
        x=(i/nx-.5)*1.16
        rise=min(1,v/.22);rise=rise*rise*(3-2*rise)
        z=.43+.68*rise*math.sqrt(max(0,1-(x/.59)**2))+.009*math.sin(v*math.tau*2+i*.7)
        verts.append((1.20+x,y,z))
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
mesh=bpy.data.meshes.new('Bed · tucked cover');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new('Bed sleep cover',mesh);FURNITURE.objects.link(ob);mesh.materials.append(bedding)
for face in mesh.polygons:face.use_smooth=True
solid=ob.modifiers.new('Quilt thickness','SOLIDIFY');solid.thickness=.025
ob.hide_render=True
# A few stitched channels read as fabric while keeping the mesh inexpensive.
for x in [.80,1.00,1.20,1.40,1.60]:
    path('Bed quilt stitch',[(x,.38,.407),(x,.65,.408),(x,.92,.408),(x,1.18,.407)],.0035,pillow)

# Lightweight interactive props: authored here, animated by the app.
can_mat=material('Watering can · sage enamel',(.19,.35,.30),.4)
ball_mat=material('Toy ball · apricot felt',(.85,.35,.16),.85)
blanket_mat=material('Blanket · dusk blue',(.25,.32,.51),.96)
can=cyl('Watering can body',(-1.66,.58,.19),.15,.23,can_mat)
path('Watering can handle',[(-1.80,.58,.22),(-1.92,.58,.38),(-1.68,.58,.40),(-1.58,.58,.30)],.023,wood_light)
path('Watering can spout',[(-1.54,.58,.16),(-1.34,.58,.24),(-1.27,.58,.32)],.034,can_mat)
uv('Toy ball',(1.25,-1.40,.145),(.145,.145,.145),ball_mat,segments=24,rings=12)
for axis in [0,1]:
    path('Toy ball stripe',[(1.25+.147*math.cos(a*math.tau/48),-1.40+(.147*math.sin(a*math.tau/48) if axis==0 else 0),.145+(0 if axis==0 else .147*math.sin(a*math.tau/48))) for a in range(48)],.012,cream,closed=True)
verts=[];faces=[];n=18
for j in range(n+1):
    v=j/n
    for i in range(n+1):
        x=(i/n-.5)*1.16
        depth=(.57-.08*v)*math.sqrt(max(.02,1-(x/.60)**2))
        fold=.014*math.sin(i/n*math.tau*5+v*2)
        height=.10+.48*v+.07*math.cos(x*3)+.012*math.sin(i/n*math.tau*3)
        verts.append((x,-depth-fold,height))
for j in range(n):
    for i in range(n):
        a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
mesh=bpy.data.meshes.new('Blanket · soft drape');mesh.from_pydata(verts,[],faces);mesh.update()
blanket=bpy.data.objects.new('Blanket',mesh);FURNITURE.objects.link(blanket);mesh.materials.append(blanket_mat)
for face in mesh.polygons:face.use_smooth=True
solid=blanket.modifiers.new('Soft hem thickness','SOLIDIFY');solid.thickness=.012
blanket.hide_render=True

sys.path.insert(0,str(Path(__file__).resolve().parent))
from asset_utils import export_groups,aim

# Keep the middle of the floor clear. The cup and table move together, preserving
# the baked two-hand grip; the watering can gets its own visible place on the shelf.
for ob in list(FURNITURE.objects):
    if ob.name.startswith(('Tea','Cup','Book')): ob.location.x -= .15
    if ob.name.startswith('Watering can'): ob.location += Vector((.86,1.06,.83))

# Semantic export groups preserve future room customisation at low draw cost.
objects=[o for o in list(ROOM.objects)+list(FURNITURE.objects) if o!=cutter]
for ob in objects:
    name=ob.name
    group='Architecture'
    for prefixes,label in [
        (('Tatami','Weave'),'Tatami'),(('Bonsai',),'Bonsai'),
        (('Tea','Cup'),'Tea_table'),(('Book',),'Books'),
        (('Cushion',),'Cushion'),(('Lamp','River stone'),'Lamp'),(('Bed',),'Bed'),
        (('Long window shelf',),'Shelf'),
        (('Garden','Distant','Morning','Bamboo'),'Garden')]:
        if name.startswith(prefixes):group=label;break
    if name=='Bed sleep cover':group='Bed_cover'
    if name.startswith('Morning sun'):group='Window_sun'
    if name.startswith('Night moon'):group='Window_moon'
    if name.startswith('Night star'):group='Window_stars'
    if name.startswith('Bonsai crown'):group='Bonsai_leaves'
    if name.startswith(('Tea cup','Tea surface','Cup handle')):group='Tea_cup'
    if name.startswith('Watering can'):group='Watering_can'
    if name.startswith('Toy ball'):group='Toy_ball'
    if name=='Blanket':group='Blanket'
    ob['asset_group']=group
export_groups(objects,OUT/'room-raw.glb')
cutter.hide_set(True)

anchors={'pet':[1.07,.35,.76],'floor':[1.07,0,1.5],'table':[-1.08,.53,.47],
         'bed':[1.20,.41,-.43],'wateringCan':[-.80,1.07,-1.64],
         'lamp':[2.02,.95,-1.52],'window':[.36,1.96,-1.925]}
for name,p in anchors.items():
    marker=bpy.data.objects.new('Anchor_'+name,None);ROOM.objects.link(marker)
    marker.location=(p[0],-p[2],p[1]);marker.empty_display_type='PLAIN_AXES';marker.empty_display_size=.12
    marker['gltf_position']=p;marker.hide_render=True

# Append the approved native character only for composition and render checks.
character_source=OUT/'wardrobe.blend'
if not character_source.exists():character_source=ROOT/'blender'/'blobby.blend'
with bpy.data.libraries.load(str(character_source),link=False) as (data_from,data_to):
    data_to.objects=[name for name in data_from.objects if name.startswith(('Blobby','Raincoat','Sweater','Straw hat','Glasses'))]
for ob in data_to.objects:
    if ob is not None:CHAR.objects.link(ob)
rig=next(o for o in CHAR.objects if o.type=='ARMATURE')
rig.scale=(.61,.61,.61);rig.location=(1.07,-.76,.35)
for ob in FURNITURE.objects:
    if ob.name.startswith('Night'): ob.hide_render=True
scene.frame_set(1)

def area(name,loc,energy,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.size=size
    obj=bpy.data.objects.new(name,data);STUDIO.objects.link(obj);obj.location=loc;aim(obj,(0,0,1))
area('Key · large window',(-3.5,-4,6),600,(1,.87,.72),5)
area('Fill · soft daylight',(3,-1,4),140,(.75,.87,1),4)
area('Rim · warm wall',(2,4,5),220,(1,.87,.69),3)
data=bpy.data.cameras.new('Room camera');data.type='ORTHO';data.ortho_scale=5.8
camera=bpy.data.objects.new('Camera_Room',data);STUDIO.objects.link(camera)
camera.location=(4.7,-8.5,6.0);aim(camera,(0,0,1.05));scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.world.color=(.12,.12,.12);scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.4
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.type='MATERIAL';a.spaces.active.overlay.show_overlays=False
notes=bpy.data.texts.new('READ ME · Asset library room')
notes.write('Editable room rebuilt from primitives. Select Blobby_Rig > Object Properties > Custom Properties > Outfit: 0 base, 1 glasses, 2 sweater, 3 raincoat, 4 frog, 5 starlight, 6 strawberry. Exported room groups: Architecture, Tatami, Bonsai, Tea_table, Books, Cushion, Lamp, Shelf, Garden. Floor Z=0. Anchor empties contain glTF Y-up positions. App character scale = 0.61. Bed and window celestial groups are interactive; the watering can lives on the shelf. Export excludes the studio, cutters, anchors and composition character. Regenerate using npm run assets:build. Save manual edits separately before regeneration.')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'room.blend'))
(OUT/'scene-contract.json').write_text(json.dumps({
 'version':2,'units':'metres','up':'Y','front':'+Z','characterScale':.5,
 'anchors':anchors,'camera':{'position':[6.7,6.8,9],'target':[0,1.22,0],'extent':7.4},
 'outfits':['base','glasses','sweater','raincoat','frog','starlight','strawberry'],
 'clips':{'idle':4,'wave':3,'happy':3,'celebrating':4,'worried':4,'sick':4,'critical':4,'recovering':4,'walk_to_cushion':2,'rest':4,'feeding':6,'petting':3,'dance':4,'curious':4,'stretch':4,'tea':json.loads((ROOT.parent/'src/domain/tea-motion.json').read_text())['duration'],'tend':4,'ball':3,'window':4},
 'roomGroups':sorted(set(o['asset_group'] for o in objects)),
},indent=2)+'\n')
if '--render' in sys.argv:
    scene.render.filepath=str(OUT/'room.png');bpy.ops.render.render(write_still=True)
print('ROOM_OK',len(objects))
