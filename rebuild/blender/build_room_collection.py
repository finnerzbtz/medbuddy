"""Modular room collectibles, authored in Blender. Runtime animates tagged parts.
Run with Blender --background --factory-startup --python this_file.py.
The original room/character exports are untouched. Z-up source, Y-up GLB.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'generated';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parent))
from asset_utils import material,box,ellipsoid,curve,surface,export_groups
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
col=bpy.data.collections.new('Room collection · editable pieces');bpy.context.scene.collection.children.link(col)
wood=material('Collection · warm oak',(.48,.30,.17));sand=material('Collection · fine sand',(.78,.63,.41),.95)
ripple=material('Collection · sand ridges',(.60,.46,.27),.95);stone=material('Collection · river stones',(.22,.28,.28),.9)
cream=material('Collection · porcelain',(.85,.78,.63));ink=material('Collection · charcoal vinyl',(.022,.035,.042),.4)
lilac=material('Collection · lilac enamel',(.44,.34,.59),.4);gold=material('Collection · brass',(.55,.34,.12),.28)
pink=material('Collection · wax glow',(.80,.22,.50),.38);honey=material('Collection · mushroom glow',(.94,.53,.15),.5)
glass=material('Collection · lavender glass',(.32,.19,.51),.12)
glass.diffuse_color=(.32,.19,.51,.20);bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Alpha'].default_value=.20
sky=material('Collection · sky',(.34,.57,.68));water=material('Collection · turquoise sea',(.12,.48,.53),.35)
foam=material('Collection · sea foam',(.64,.85,.79));mountain=material('Collection · distant mountain',(.30,.39,.51));forest=material('Collection · alpine pines',(.12,.27,.22));snow=material('Collection · snow',(.85,.89,.88))
sunmat=material('Collection · sunlight',(.98,.71,.27));moonmat=material('Collection · moonlight',(.69,.80,.97))
for mat,power in [(pink,1.2),(honey,.7),(sunmat,.8),(moonmat,1),(sky,.15)]:
 bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=mat.diffuse_color;bs.inputs['Emission Strength'].default_value=power
current='';parts=[];item_collections={}
def mark(ob,part=None,motion=None,celestial=None):
 if current not in item_collections:
  child=bpy.data.collections.new(current.replace('_',' ').title());col.children.link(child);item_collections[current]=child
 for prior in list(ob.users_collection):prior.objects.unlink(ob)
 item_collections[current].objects.link(ob)
 ob['room_item']=current;ob['asset_group']='Collection_'+current+('_'+part if part else '')
 if motion:ob['room_motion']=motion
 if celestial:ob['room_celestial']=celestial
 parts.append(ob);return ob
def cube(name,loc,size,mat,bevel=.018):return mark(box(name,loc,size,mat,col,bevel))
def ball(name,loc,size,mat,part=None,motion=None):return mark(ellipsoid(name,loc,size,mat,col,20,10),part,motion)
def line(name,pts,r,mat,closed=False,part=None,motion=None):return mark(curve(name,pts,r,mat,col,closed,resolution=1),part,motion)
def cylinder(name,loc,radius,depth,mat,top=None,part=None,motion=None):
 bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=radius,radius2=radius if top is None else top,depth=depth,location=loc)
 ob=bpy.context.object;ob.name=name
 for c in list(ob.users_collection):c.objects.unlink(ob)
 col.objects.link(ob);ob.data.materials.append(mat)
 for f in ob.data.polygons:f.use_smooth=True
 return mark(ob,part,motion)
def face(name,pts,mat,part=None,celestial=None):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(pts,[],[tuple(range(len(pts)))]);mesh.update()
 ob=bpy.data.objects.new(name,mesh);col.objects.link(ob);mesh.materials.append(mat)
 return mark(ob,part,celestial=celestial)
# A small sand tray occupies the old bonsai footprint. The walking aisle stays clear.
current='sand_garden'
cube('Zen pedestal',(-1.65,1.23,.31),(.65,.63,.62),wood,.04)
cube('Zen tray',(-1.65,1.23,.67),(.72,.67,.13),wood,.04)
cube('Fine sand',(-1.65,1.23,.744),(.65,.60,.022),sand,.035)
for idx,(x,y,r) in enumerate([(-1.80,1.34,.072),(-1.49,1.28,.09),(-1.63,1.08,.06)]):
 ball('Smooth stone '+str(idx),(x,y,.783),(r,r*.8,r*.62),stone)
 for ring in range(3):
  rr=r+.025+ring*.019
  line('Raked ripple',[(x+rr*math.cos(a*math.tau/48),y+rr*.78*math.sin(a*math.tau/48),.758) for a in range(48)],.0035,ripple,True)
line('Rake handle',[(-1.97,1.01,.80),(-1.89,1.35,.80)],.012,wood)
line('Rake head',[(-1.98,1.38,.80),(-1.79,1.34,.80)],.015,wood)
for i in range(5):line('Rake tine',[(-1.97+i*.04,1.38-i*.008,.80),(-1.99+i*.04,1.31-i*.008,.80)],.005,gold)
# Turntable plus its own matching low table, replacing the entire tea assembly.
current='record_player'
cube('Vinyl table',(-1.08,-.47,.48),(1.16,.76,.095),wood,.045)
for x in [-1.51,-.65]:
 for y in [-.71,-.23]:cube('Vinyl table leg',(x,y,.225),(.08,.08,.45),wood)
cube('Turntable enclosure',(-1.12,-.47,.592),(.80,.52,.16),lilac,.03)
cube('Deck top',(-1.12,-.47,.679),(.74,.46,.03),cream,.02)
cylinder('Black record',(-1.23,-.45,.708),.205,.014,ink)
cylinder('Record label',(-1.23,-.45,.719),.070,.004,honey)
# An off-centre label dot makes record rotation perceptible at room scale.
ball('Record dot',(-1.205,-.445,.725),(.017,.017,.003),cream,'disc_dot','record')
for radius in [.11,.145,.18]:line('Record groove',[(-1.23+radius*math.cos(a*math.tau/48),-.45+radius*math.sin(a*math.tau/48),.719) for a in range(48)],.002,stone,True)
cylinder('Tonearm pivot',(-.83,-.27,.723),.028,.06,gold)
line('Brass tonearm',[(-.83,-.27,.75),(-.85,-.51,.75),(-1.00,-.58,.75)],.011,gold)
cube('Tonearm cartridge',(-1.00,-.58,.74),(.046,.06,.038),ink,.005)
for x in [-1.30,-1.22,-1.14,-1.06,-.98]:cube('Speaker slot',(x,-.738,.59),(.035,.012,.05),ink,.005)
cylinder('Volume dial',(-.84,-.62,.703),.025,.035,gold)
# Both lamps include a stand, so replacing the old lamp group is complete.
def stand():cube('Bedside pedestal',(2.02,1.52,.38),(.34,.42,.76),wood,.03)
current='lava_lamp';stand()
cylinder('Lava base',(2.02,1.52,.81),.15,.11,gold,top=.105)
cylinder('Lava lower glass',(2.02,1.52,.99),.12,.26,glass,top=.165)
cylinder('Lava upper glass',(2.02,1.52,1.23),.165,.22,glass,top=.065)
cylinder('Lava cap',(2.02,1.52,1.375),.067,.09,gold,top=.012)
# Each wax blob is a separate semantic node with an authored rest position.
for i,(dx,dy,z,r) in enumerate([(-.04,-.02,.93,.068),(.04,.015,1.02,.07),(-.03,.015,1.14,.058),(.005,-.01,1.24,.043)]):
 ball('Lava wax '+str(i),(2.02+dx,1.52+dy,z),(r,r*.82,r*1.18),pink,'wax_'+str(i),'lava')
current='mushroom_lamp';stand()
cylinder('Mushroom foot',(2.02,1.52,.80),.13,.065,gold)
cylinder('Mushroom stem',(2.02,1.52,.91),.065,.20,cream,top=.08)
# Closed dome instead of a stretched sphere: a recognizable lamp silhouette.
profile=[(.001,1.20),(.09,1.18),(.17,1.12),(.205,1.04),(.195,1.02),(.06,1.015),(.001,1.015)]
verts=[];faces=[];N=40
for r,z in profile:
 for i in range(N):verts.append((2.02+r*math.cos(i*math.tau/N),1.52+r*math.sin(i*math.tau/N),z))
for j in range(len(profile)-1):
 for i in range(N):a=j*N+i;b=j*N+(i+1)%N;faces.append((a,b,b+N,a+N))
mark(surface('Honey mushroom cap',verts,faces,honey,col,sub=0))
for dx,dy,z in [(-.09,-.06,1.154),(.05,-.12,1.118),(.11,.03,1.155)]:ball('Mushroom spot',(2.02+dx,1.52+dy,z),(.025,.025,.008),cream)
# Window dioramas sit behind the existing architectural opening and wooden frame.
def view_base():
 ob=cylinder('Window sky',(.36,2.11,1.96),1.0,.03,sky);ob.rotation_euler.x=math.pi/2
 for name,mat,z,celestial in [('Sun',sunmat,2.36,'sun'),('Moon',moonmat,2.36,'moon')]:
  ob=ball(name,(.78,2.015,z),(.115,.018,.115),mat,celestial);ob['room_celestial']=celestial
 for i,(x,z) in enumerate([(-.10,2.44),(.25,2.64),(.85,2.18),(-.28,2.08)]):
  ob=ball('Window star',(x,2.01,z),(.016,.009,.016),moonmat,'stars');ob['room_celestial']='stars'
current='coast_view';view_base()
pts=[(.36-.86,2.065,1.94),(.36+.86,2.065,1.94)]+[(.36+.86*math.cos(-a*math.pi/48),2.065,1.94+.86*math.sin(-a*math.pi/48)) for a in range(49)]
face('Sea horizon',pts,water)
for i in range(4):
 z=1.36+i*.135;width=math.sqrt(max(0,.78**2-(z-1.96)**2))*.87
 line('Gentle wave',[(.36-width+2*width*j/32,2.032,z+.009*math.sin(j*.4+i)) for j in range(33)],.006,foam,part='waves',motion='wave')
face('Boat hull',[(.04,2.005,1.80),(.30,2.005,1.80),(.25,2.005,1.74),(.09,2.005,1.74)],wood)
face('Sail',[(.15,2.002,1.83),(.15,2.002,2.10),(.01,2.002,1.83)],cream)
line('Mast',[(.17,2.004,1.78),(.17,2.004,2.12)],.007,gold)
current='mountain_view';view_base()
face('Far peak',[(-.44,2.06,1.34),(.03,2.06,2.40),(.68,2.06,1.31)],mountain)
face('Near peak',[(.01,2.04,1.27),(.56,2.04,2.26),(1.16,2.04,1.49)],forest)
face('Far snowcap',[(-.10,2.025,2.10),(.03,2.025,2.40),(.22,2.025,2.09),(.11,2.025,2.17),(.02,2.025,2.12)],snow)
face('Near snowcap',[(.40,2.02,1.97),(.56,2.02,2.26),(.74,2.02,2.04),(.57,2.02,2.08)],snow)
for x,z,h in [(-.12,1.37,.25),(.86,1.47,.28),(.65,1.25,.19)]:
 face('Alpine pine',[(x-.09,2.005,z),(x,2.005,z+h),(x+.09,2.005,z)],forest)
# Save native source before export. Shared static parts merge by item, animated nodes stay separate.
for key in ['mushroom_lamp','mountain_view']:
 item_collections[key].hide_viewport=True;item_collections[key].hide_render=True
notes=bpy.data.texts.new('READ ME · Room collection')
notes.write('Ten catalog items use the original room plus these six new Blender models. Each new item has its own collection. Toggle collection visibility to inspect alternate lamps and window scenes. Export groups preserve room_item, room_motion and room_celestial metadata. Runtime applies one choice per slot, with no textures. Regenerate with this script, then node rebuild/scripts/room-collection.mjs. Original room and character files remain separate. Coordinates are metres, Z-up; exported GLB is Y-up.')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'room-collection.blend'))
export_groups(parts,OUT/'room-collection-raw.glb')
print('Room collection built:',len(parts),'editable pieces')
