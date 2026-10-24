/* Small procedural mailbox. All textures and geometry stay local. */
(() => {
  'use strict';
  const host=document.getElementById('question-scene'), canvas=document.getElementById('question-canvas'), fallback=document.getElementById('question-scene-fallback');
  if(!host||!canvas)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), fine=matchMedia('(hover: hover) and (pointer: fine)');
  let renderer,scene,camera,stage,envelope,lid,light,initialized=false,failed=false,visible=false,frame=0,last=0,dropStart=-10000,disposed=false;
  let x=0,y=0,vx=0,vy=0,tx=0,ty=0,dragging=false,lastX=0,dragDistance=0,dragYaw=0,hovered=false;
  const resources=new Set();const own=r=>(resources.add(r),r);
  const motion=()=>!reduced.matches&&!document.body.classList.contains('motion-off');
  const noScene=()=>{failed=true;canvas.style.display='none';fallback.hidden=false;host.dataset.state='fallback';stop();};
  const T=window.THREE;
  function init(){
    if(initialized||failed||disposed)return;
    if(!T){noScene();return;}
    try{renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});}catch(_){noScene();return;}
    scene=new T.Scene();camera=new T.PerspectiveCamera(32,1,.1,40);camera.position.set(4.3,3.8,7.7);camera.lookAt(0,1.42,0);
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0x000000,0);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    stage=new T.Group();stage.rotation.y=-.12;scene.add(stage);
    const material=(color,extra={})=>{const m=own(new T.MeshStandardMaterial({color,roughness:.42,metalness:.04,...extra}));m.color.convertSRGBToLinear();return m;};
    const white=material(0xffffff),ice=material(0xd4ecfa),blue=material(0x7bc3e8),dark=material(0x23658f),silver=material(0xdceaf4,{metalness:.35,roughness:.3});
    const mmesh=(geo,mat,parent,pos)=>{const mesh=new T.Mesh(own(geo),mat);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
    function rounded(w,h,d,r=.12){
      const b=Math.min(r*.4,d*.24),ww=w-2*b,hh=h-2*b,xx=-ww/2,yy=-hh/2,rr=Math.min(r,ww/3,hh/3);const s=new T.Shape();
      s.moveTo(xx+rr,yy);s.lineTo(xx+ww-rr,yy);s.quadraticCurveTo(xx+ww,yy,xx+ww,yy+rr);s.lineTo(xx+ww,yy+hh-rr);s.quadraticCurveTo(xx+ww,yy+hh,xx+ww-rr,yy+hh);s.lineTo(xx+rr,yy+hh);s.quadraticCurveTo(xx,yy+hh,xx,yy+hh-rr);s.lineTo(xx,yy+rr);s.quadraticCurveTo(xx,yy,xx+rr,yy);
      const g=new T.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:b,bevelThickness:b,curveSegments:12});g.translate(0,0,-d/2+b);g.computeVertexNormals();return g;
    }
    const box=(parent,w,h,d,mat,pos,r=.12)=>mmesh(rounded(w,h,d,r),mat,parent,pos);
    box(stage,2.28,1.9,1.45,ice,[0,1.16,0],.21);
    box(stage,2.03,1.67,.09,white,[0,1.16,.765],.17);
    box(stage,2.36,.19,1.53,white,[0,.18,0],.13);
    box(stage,1.96,.1,1.23,dark,[0,.08,0],.07);
    // The top lid and mail slot give the object a recognizable physical purpose.
    lid=new T.Group();lid.position.set(0,2.08,-.52);stage.add(lid);
    box(lid,2.39,.18,1.58,blue,[0,.015,.52],.13);
    box(lid,1.58,.028,.15,dark,[0,.118,.71],.035);
    box(lid,1.59,.035,.055,white,[0,.137,.59],.02);
    box(stage,1.26,.12,.045,dark,[0,1.66,.826],.045);
    box(stage,1.28,.045,.08,blue,[0,1.75,.83],.02);
    // Front badge is printed onto a canvas texture, with real geometry around it.
    const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=512;const c=labelCanvas.getContext('2d');
    c.clearRect(0,0,512,512);c.fillStyle='#328ccc';c.font='600 240px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('?',256,218);c.fillStyle='#6a9fbd';c.font='500 45px Microsoft YaHei, sans-serif';c.fillText('提问箱',256,401);
    const tex=own(new T.CanvasTexture(labelCanvas));tex.encoding=T.sRGBEncoding;
    const badgeMat=own(new T.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false}));
    const badge=mmesh(new T.PlaneGeometry(1.1,1.1),badgeMat,stage,[0,1.02,.818]);badge.castShadow=false;
    for(const sx of [-.84,.84]){const screw=mmesh(new T.CylinderGeometry(.031,.031,.025,16),silver,stage,[sx,.48,.83]);screw.rotation.x=Math.PI/2;}
    // A hinged blue side flag and a tiny round pin.
    box(stage,.045,.65,.13,dark,[1.19,1.32,0],.025);box(stage,.045,.29,.38,blue,[1.19,1.65,.12],.035);
    const pin=mmesh(new T.CylinderGeometry(.055,.055,.06,24),white,stage,[1.23,1.08,0]);pin.rotation.z=Math.PI/2;
    // Floating envelope: white paper, blue folded seams and a round seal.
    envelope=new T.Group();stage.add(envelope);box(envelope,1.19,.77,.055,white,[0,0,0],.025);
    const seamMat=own(new T.LineBasicMaterial({color:0x8abbd8}));
    const line=(points)=>{const l=new T.Line(own(new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)))),seamMat);envelope.add(l);};
    line([[-.57,.35,.035],[0,-.045,.035],[.57,.35,.035]]);line([[-.57,-.35,.036],[-.17,-.025,.036]]);line([[.57,-.35,.036],[.17,-.025,.036]]);
    const seal=mmesh(new T.CylinderGeometry(.065,.065,.014,24),blue,envelope,[0,-.046,.045]);seal.rotation.x=Math.PI/2;
    envelope.rotation.set(-.15,.08,-.18);envelope.position.set(.08,2.8,.21);
    // Ground contact shadow and two soft studio lights.
    const floor=mmesh(new T.PlaneGeometry(12,12),own(new T.ShadowMaterial({opacity:.12})),scene,[0,-.015,0]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    scene.add(new T.HemisphereLight(0xffffff,0x91bbd6,.9));
    light=new T.DirectionalLight(0xffffff,1.45);light.position.set(-3.5,6,5);light.castShadow=true;light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-4,right:4,top:5,bottom:-4,near:.1,far:18});light.shadow.normalBias=.025;light.shadow.bias=-.00015;light.shadow.radius=4;scene.add(light);
    const fill=new T.DirectionalLight(0xb6e7ff,.45);fill.position.set(4,3,-1);scene.add(fill);
    initialized=true;host.dataset.state='ready';fallback.hidden=true;resize();draw(performance.now());
  }
  function resize(){if(!renderer)return;const r=host.getBoundingClientRect();if(r.width<1||r.height<1){stop();return;}renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();if(!motion())draw(performance.now());else start();}
  function draw(time){
    if(!initialized||disposed)return;
    const active=motion(), t=time/1000;
    stage.rotation.y=-.12+x*.24+dragYaw;stage.rotation.x=y*.12;
    light.position.x=-3.5+x*1.8;light.position.z=5+y;
    const drop=(time-dropStart)/1000;
    if(active&&drop>=0&&drop<1.8){
      const fall=Math.min(drop/.85,1),ease=fall*fall;envelope.position.set(.08*(1-ease),2.8-ease*1.22,.21+.03*ease);envelope.rotation.set(-.15-.85*ease,.08*(1-ease),-.18*(1-ease));envelope.scale.setScalar(1-Math.max(0,(fall-.68)/.32));
      if(drop>1.05){const rise=Math.min((drop-1.05)/.75,1);envelope.scale.setScalar(rise);envelope.position.set(.08,2.8+(1-rise)*.3,.21);envelope.rotation.set(-.15,.08,-.18);}
      lid.rotation.x=-Math.sin(Math.min(drop/1.3,1)*Math.PI)*.14;
    }else{envelope.position.set(.08,2.8+(active?Math.sin(t*1.5)*.065:0),.21);envelope.rotation.set(-.15,.08,-.18);envelope.scale.setScalar(1);lid.rotation.x=active&&hovered?-.035:0;}
    renderer.render(scene,camera);
  }
  function tick(time){frame=0;if(!visible||document.hidden||!motion()||disposed)return;const dt=Math.min((time-(last||time))/1000,.035);last=time;
    vx+=(tx-x)*70*dt;vy+=(ty-y)*70*dt;const damp=Math.exp(-12*dt);vx*=damp;vy*=damp;x+=vx*dt;y+=vy*dt;
    if(!dragging)dragYaw*=Math.exp(-3*dt);draw(time);frame=requestAnimationFrame(tick);
  }
  function start(){if(disposed||failed||!visible||document.hidden)return;init();if(!initialized)return;if(motion()){if(!frame){last=0;frame=requestAnimationFrame(tick);}}else{stop();x=0;y=0;dragYaw=0;draw(performance.now());}}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
  function playDrop(){if(!visible)return;init();dropStart=performance.now();start();}
  canvas.addEventListener('pointermove',event=>{if(!motion()||event.pointerType==='touch'&&!dragging)return;const r=canvas.getBoundingClientRect();tx=(event.clientX-r.left)/r.width*2-1;ty=(event.clientY-r.top)/r.height*2-1;if(dragging){const delta=event.clientX-lastX;dragYaw=Math.max(-.65,Math.min(.65,dragYaw+delta*.006));dragDistance+=Math.abs(delta);lastX=event.clientX;}});
  canvas.addEventListener('pointerenter',()=>{hovered=true;});canvas.addEventListener('pointerleave',()=>{hovered=false;tx=ty=0;});
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||!motion())return;dragging=true;lastX=event.clientX;dragDistance=0;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointerup',event=>{if(dragging){dragging=false;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(dragDistance<5)playDrop();}});
  canvas.addEventListener('pointercancel',()=>{dragging=false;tx=ty=0;});
  document.getElementById('question-drop')?.addEventListener('click',playDrop);
  window.addEventListener('question-submitted',playDrop);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){init();resize();start();}else stop();},{threshold:.01});observer.observe(host);
  const ro=new ResizeObserver(()=>{if(visible)resize();});ro.observe(host);
  const mo=new MutationObserver(()=>{if(!motion()){stop();x=y=tx=ty=vx=vy=dragYaw=0;if(initialized)draw(performance.now());}else start();});mo.observe(document.body,{attributes:true,attributeFilter:['class']});
  reduced.addEventListener('change',()=>{stop();start();});window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  window.addEventListener('pagehide',event=>{stop();if(event.persisted)return;disposed=true;observer.disconnect();ro.disconnect();mo.disconnect();resources.forEach(r=>r.dispose());renderer?.dispose();});window.addEventListener('pageshow',start);
  window.QUESTION_BOX_SCENE={playDrop,get ready(){return initialized&&!failed;}};
})();
