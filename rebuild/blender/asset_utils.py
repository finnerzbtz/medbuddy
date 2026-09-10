"""Small, shared Blender authoring/export utilities (Blender 5)."""
import bpy
import math
import bmesh
from mathutils import Vector


def material(name, color, roughness=.6):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=roughness
    return mat


def finish(obj,name,mat,col):
    obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    col.objects.link(obj)
    if mat:obj.data.materials.append(mat)
    if obj.type=='MESH':
        for p in obj.data.polygons:p.use_smooth=True
    return obj


def ellipsoid(name,loc,scale,mat,col,segments=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    obj=bpy.context.object;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,mat,col)


def box(name,loc,size,mat,col,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(ob,name,mat,col)
    if bevel:
        mod=ob.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=3
        ob.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    return ob


def curve(name,points,radius,mat,col,closed=False,resolution=2):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
    data.bevel_depth=radius;data.bevel_resolution=resolution
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    spline.use_cyclic_u=closed
    obj=bpy.data.objects.new(name,data);col.objects.link(obj);data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    return obj


def surface(name,verts,faces,mat,col,uvs=None,sub=1):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);col.objects.link(obj);mesh.materials.append(mat)
    for face in mesh.polygons:face.use_smooth=True
    if uvs:
        layer=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for loop_i in poly.loop_indices:layer.data[loop_i].uv=uvs[mesh.loops[loop_i].vertex_index]
    # Weld geometric seams while retaining per-loop UV seams; avoid a crease
    # where the U coordinate wraps from 1 back to 0 on a subdivided garment.
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bm.to_mesh(mesh);bm.free();mesh.update()
    if sub:
        mod=obj.modifiers.new('Smooth surface','SUBSURF');mod.levels=sub;mod.render_levels=2
    return obj


def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()


def export_groups(objects,filepath,rig=None):
    """Join evaluated copies by semantic visibility group; leave authoring editable."""
    groups={};copies=[]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        copy=obj.copy();copy.data=obj.data.copy();bpy.context.scene.collection.objects.link(copy)
        copy.hide_set(False);copy.hide_render=False
        bpy.context.view_layer.objects.active=copy;copy.select_set(True)
        for mod in list(copy.modifiers):
            if mod.type=='ARMATURE':continue
            if mod.type=='SUBSURF':mod.levels=1
            bpy.ops.object.modifier_apply(modifier=mod.name)
        copy.select_set(False)
        groups.setdefault(obj.get('asset_group','room'),[]).append(copy)
        copies.append(copy)
    joined=[]
    for name,members in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in members:ob.select_set(True)
        active=members[0];bpy.context.view_layer.objects.active=active
        bpy.ops.object.join();active.name=name
        active['asset_group']=name
        joined.append(active)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined:obj.select_set(True)
    if rig:rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,
        export_apply=False,export_animations=bool(rig),export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,export_frame_range=False,export_yup=True,
        export_extras=True,export_cameras=False,export_lights=False)
    for obj in joined:bpy.data.objects.remove(obj,do_unlink=True)
