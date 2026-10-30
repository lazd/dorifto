import{An as e,Ar as t,At as n,B as r,Bn as i,C as a,Cr as o,Ct as s,D as c,Dr as l,Dt as u,E as d,Er as f,F as p,Fn as m,I as h,It as g,K as _,Lt as v,M as y,Mr as b,Mt as x,N as S,Nn as C,Nr as w,O as T,On as E,Or as D,Pn as O,Pt as k,Qn as A,Qt as ee,R as j,Rt as M,Sr as te,St as N,T as ne,Tr as re,Un as P,V as ie,Vn as F,Wt as ae,Xn as oe,Zt as se,_ as ce,_r as I,_t as L,ar as le,b as R,br as ue,bt as z,c as de,cr as fe,ct as pe,dt as B,er as me,f as he,fr as ge,g as V,gr as H,h as U,hr as _e,ht as ve,i as W,ir as ye,jn as be,jr as xe,jt as Se,kn as Ce,kr as we,kt as Te,l as G,lt as Ee,m as De,mr as Oe,nr as ke,o as Ae,or as K,pr as je,qt as Me,s as Ne,sr as Pe,st as q,tr as Fe,tt as J,u as Y,ur as Ie,ut as Le,v as Re,vr as ze,vt as X,w as Be,wr as Ve,x as He,xr as Ue,xt as We,y as Ge,yt as Ke,zt as qe}from"./three.core-BREHV5Uh.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function Je(){let e=null,t=!1,n=null,r=null;function i(t,a){r=e.requestAnimationFrame(i),n(t,a)}return{start:function(){t!==!0&&n!==null&&e!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function Ye(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var Z={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},Q={common:{diffuse:{value:new U(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new X},alphaMap:{value:null},alphaMapTransform:{value:new X},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new X}},envmap:{envMap:{value:null},envMapRotation:{value:new X},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new X}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new X}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new X},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new X},normalScale:{value:new H(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new X},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new X}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new X}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new X}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new U(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new I},probesMax:{value:new I},probesResolution:{value:new I}},points:{diffuse:{value:new U(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new X},alphaTest:{value:0},uvTransform:{value:new X}},sprite:{diffuse:{value:new U(16777215)},opacity:{value:1},center:{value:new H(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new X},alphaMap:{value:null},alphaMapTransform:{value:new X},alphaTest:{value:0}}},Xe={basic:{uniforms:t([Q.common,Q.specularmap,Q.envmap,Q.aomap,Q.lightmap,Q.fog]),vertexShader:Z.meshbasic_vert,fragmentShader:Z.meshbasic_frag},lambert:{uniforms:t([Q.common,Q.specularmap,Q.envmap,Q.aomap,Q.lightmap,Q.emissivemap,Q.bumpmap,Q.normalmap,Q.displacementmap,Q.fog,Q.lights,{emissive:{value:new U(0)},envMapIntensity:{value:1}}]),vertexShader:Z.meshlambert_vert,fragmentShader:Z.meshlambert_frag},phong:{uniforms:t([Q.common,Q.specularmap,Q.envmap,Q.aomap,Q.lightmap,Q.emissivemap,Q.bumpmap,Q.normalmap,Q.displacementmap,Q.fog,Q.lights,{emissive:{value:new U(0)},specular:{value:new U(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Z.meshphong_vert,fragmentShader:Z.meshphong_frag},standard:{uniforms:t([Q.common,Q.envmap,Q.aomap,Q.lightmap,Q.emissivemap,Q.bumpmap,Q.normalmap,Q.displacementmap,Q.roughnessmap,Q.metalnessmap,Q.fog,Q.lights,{emissive:{value:new U(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Z.meshphysical_vert,fragmentShader:Z.meshphysical_frag},toon:{uniforms:t([Q.common,Q.aomap,Q.lightmap,Q.emissivemap,Q.bumpmap,Q.normalmap,Q.displacementmap,Q.gradientmap,Q.fog,Q.lights,{emissive:{value:new U(0)}}]),vertexShader:Z.meshtoon_vert,fragmentShader:Z.meshtoon_frag},matcap:{uniforms:t([Q.common,Q.bumpmap,Q.normalmap,Q.displacementmap,Q.fog,{matcap:{value:null}}]),vertexShader:Z.meshmatcap_vert,fragmentShader:Z.meshmatcap_frag},points:{uniforms:t([Q.points,Q.fog]),vertexShader:Z.points_vert,fragmentShader:Z.points_frag},dashed:{uniforms:t([Q.common,Q.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Z.linedashed_vert,fragmentShader:Z.linedashed_frag},depth:{uniforms:t([Q.common,Q.displacementmap]),vertexShader:Z.depth_vert,fragmentShader:Z.depth_frag},normal:{uniforms:t([Q.common,Q.bumpmap,Q.normalmap,Q.displacementmap,{opacity:{value:1}}]),vertexShader:Z.meshnormal_vert,fragmentShader:Z.meshnormal_frag},sprite:{uniforms:t([Q.sprite,Q.fog]),vertexShader:Z.sprite_vert,fragmentShader:Z.sprite_frag},background:{uniforms:{uvTransform:{value:new X},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Z.background_vert,fragmentShader:Z.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new X}},vertexShader:Z.backgroundCube_vert,fragmentShader:Z.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Z.cube_vert,fragmentShader:Z.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Z.equirect_vert,fragmentShader:Z.equirect_frag},distance:{uniforms:t([Q.common,Q.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Z.distance_vert,fragmentShader:Z.distance_frag},shadow:{uniforms:t([Q.lights,Q.fog,{color:{value:new U(0)},opacity:{value:1}}]),vertexShader:Z.shadow_vert,fragmentShader:Z.shadow_frag}};Xe.physical={uniforms:t([Xe.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new X},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new X},clearcoatNormalScale:{value:new H(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new X},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new X},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new X},sheen:{value:0},sheenColor:{value:new U(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new X},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new X},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new X},transmissionSamplerSize:{value:new H},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new X},attenuationDistance:{value:0},attenuationColor:{value:new U(0)},specularColor:{value:new U(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new X},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new X},anisotropyVector:{value:new H},anisotropyMap:{value:null},anisotropyMapTransform:{value:new X}}]),vertexShader:Z.meshphysical_vert,fragmentShader:Z.meshphysical_frag};var Ze={r:0,b:0,g:0},Qe=new Ke,$e=new X;$e.set(-1,0,0,0,1,0,0,0,1);function et(e,t,n,r,i,a){let s=new U(0),c=i===!0?0:1,l,u,d=null,f=0,p=null;function m(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function h(t){let r=!1,i=m(t);i===null?_(s,c):i&&i.isColor&&(_(i,1),r=!0);let o=e.xr.getEnvironmentBlendMode();o===`additive`?n.buffers.color.setClear(0,0,0,1,a):o===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function g(t,n){let i=m(n);i&&(i.isCubeTexture||i.mapping===306)?(u===void 0&&(u=new z(new de(1,1,1),new P({name:`BackgroundCubeMaterial`,uniforms:o(Xe.backgroundCube.uniforms),vertexShader:Xe.backgroundCube.vertexShader,fragmentShader:Xe.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute(`normal`),u.geometry.deleteAttribute(`uv`),u.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(u)),u.material.uniforms.envMap.value=i,u.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Qe.makeRotationFromEuler(n.backgroundRotation)).transpose(),i.isCubeTexture&&i.isRenderTargetTexture===!1&&u.material.uniforms.backgroundRotation.value.premultiply($e),u.material.toneMapped=V.getTransfer(i.colorSpace)!==F,(d!==i||f!==i.version||p!==e.toneMapping)&&(u.material.needsUpdate=!0,d=i,f=i.version,p=e.toneMapping),u.layers.enableAll(),t.unshift(u,u.geometry,u.material,0,0,null)):i&&i.isTexture&&(l===void 0&&(l=new z(new qe(2,2),new P({name:`BackgroundMaterial`,uniforms:o(Xe.background.uniforms),vertexShader:Xe.background.vertexShader,fragmentShader:Xe.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(l)),l.material.uniforms.t2D.value=i,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.toneMapped=V.getTransfer(i.colorSpace)!==F,i.matrixAutoUpdate===!0&&i.updateMatrix(),l.material.uniforms.uvTransform.value.copy(i.matrix),(d!==i||f!==i.version||p!==e.toneMapping)&&(l.material.needsUpdate=!0,d=i,f=i.version,p=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null))}function _(t,r){t.getRGB(Ze,D(e)),n.buffers.color.setClear(Ze.r,Ze.g,Ze.b,r,a)}function v(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return s},setClearColor:function(e,t=1){s.set(e),c=t,_(s,c)},getClearAlpha:function(){return c},setClearAlpha:function(e){c=e,_(s,c)},render:h,addToRenderList:g,dispose:v}}function tt(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function nt(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s}function rt(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&n!==1015&&!i&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(b(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`);n.reversedDepthBuffer===!0&&f===!1&&b(`WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.`);let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),x=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),S=e.getParameter(e.MAX_SAMPLES),C=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:x,maxSamples:S,samples:C}}function it(e){let t=this,n=null,r=0,i=!1,a=!1,o=new M,s=new X,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var at=4,ot=6,st=20,ct=256,lt=new g,ut=new U,dt=null,ft=0,pt=0,mt=!1,ht=new I,gt=new I,_t=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=ht}=i;dt=this._renderer.getRenderTarget(),ft=this._renderer.getActiveCubeFace(),pt=this._renderer.getActiveMipmapLevel(),mt=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=wt(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Ct(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(dt,ft,pt),this._renderer.xr.enabled=mt,e.scissorTest=!1,bt(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),dt=this._renderer.getRenderTarget(),ft=this._renderer.getActiveCubeFace(),pt=this._renderer.getActiveMipmapLevel(),mt=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:q,minFilter:q,generateMipmaps:!1,type:ie,format:se,colorSpace:Le,depthBuffer:!1},r=yt(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=yt(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=vt(r)),this._blurMaterial=St(r,e,t),this._ggxMaterial=xt(r,e,t)}return r}_compileMaterial(e){let t=new z(new Y,e);this._renderer.compile(t,lt)}_sceneToCubeUV(e,t,n,r,i){let a=new v(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(ut),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new z(new de,new We({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(ut),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;bt(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=wt()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Ct());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;bt(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,lt)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-at?n-d+at:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,bt(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,lt),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,bt(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,lt)}_blur(e,t,n,r){let i=this._pingPongRenderTarget,a=Math.min(r,Math.PI)/Math.SQRT2;this._blurPass(e,i,t,n,a),this._blurPass(i,e,n,n,a)}_blurPass(e,t,n,r,i){let a=this._renderer,o=this._blurMaterial,s=this._lodMeshes[r];s.material=o;let c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=i,c.mipInt.value=this._lodMax-n;let l=this._sizeLods[r];bt(t,3*l*(r>this._lodMax-at?r-this._lodMax+at:0),4*(this._cubeSize-l),3*l,2*l),a.setRenderTarget(t),a.render(s,lt)}};function vt(e){let t=[],n=[],r=e,i=e-at+1+ot;for(let e=0;e<i;e++){let e=2**r;t.push(e);let i=1/(e-2),a=-i,o=1+i,s=[a,a,o,a,o,o,a,a,o,o,a,o],c=new Float32Array(108),l=new Float32Array(108);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];c.set(r,18*e);for(let t=0;t<6;t++){let n=s[t*2]*2-1,r=s[t*2+1]*2-1;e===0?gt.set(1,r,n):e===1?gt.set(-n,1,-r):e===2?gt.set(-n,r,1):e===3?gt.set(-1,r,-n):e===4?gt.set(-n,-1,r):gt.set(n,r,-1),gt.toArray(l,(e*6+t)*3)}}let u=new Y;u.setAttribute(`position`,new G(c,3)),u.setAttribute(`outputDirection`,new G(l,3)),n.push(new z(u,null)),r>at&&r--}return{lodMeshes:n,sizeLods:t}}function yt(e,t,n){let r=new Ue(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function bt(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function xt(e,t,n){return new P({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:ct,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Tt(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function St(e,t,n){return new P({name:`SphericalGaussianBlur`,defines:{SAMPLES:st,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Tt(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Ct(){return new P({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:Tt(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function wt(){return new P({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Tt(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function Tt(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}var Et=class extends Ue{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new R(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new de(5,5,5),i=new P({name:`CubemapFromEquirect`,uniforms:o(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new z(r,i),s=t.minFilter;return t.minFilter===1008&&(t.minFilter=q),new Re(1,10,this).update(e,a),t.minFilter=s,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function Dt(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new Et(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new _t(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new _t(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function Ot(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&w(`WebGLRenderer: `+e+` extension not supported.`),t}}}function kt(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0||(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++),t}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?K:le)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function At(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function jt(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:f(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function Mt(e,t,n){let r=new WeakMap,i=new ze;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],f=0;e===!0&&(f=1),n===!0&&(f=2),a===!0&&(f=3);let p=o.attributes.position.count*f,m=1;p>t.maxTextureSize&&(m=Math.ceil(p/t.maxTextureSize),p=t.maxTextureSize);let g=new Float32Array(p*m*4*u),_=new Be(g,p,m,u);_.type=h,_.needsUpdate=!0;let v=f*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=p*m*4*t;for(let t=0;t<r.count;t++){let s=t*v;e===!0&&(i.fromBufferAttribute(r,t),g[d+s+0]=i.x,g[d+s+1]=i.y,g[d+s+2]=i.z,g[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),g[d+s+4]=i.x,g[d+s+5]=i.y,g[d+s+6]=i.z,g[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),g[d+s+8]=i.x,g[d+s+9]=i.y,g[d+s+10]=i.z,g[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:_,size:new H(p,m)},r.set(o,d);function y(){_.dispose(),r.delete(o),o.removeEventListener(`dispose`,y)}o.addEventListener(`dispose`,y)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function Nt(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var Pt={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function Ft(t,n,r,i,a,o){let s=new Ue(n,r,{type:t,depthBuffer:a,stencilBuffer:o,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),c=null,l=null,u=new Y;u.setAttribute(`position`,new p([-1,3,0,-1,-1,0,3,-1,0],3)),u.setAttribute(`uv`,new p([0,2,0,0,2,0],2));let d=new e({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),f=new z(u,d),m=new g(-1,1,1,-1,0,1),h=null,_=null,v=!1,y,b=null,x=[],S=!1;this.setSize=function(e,t){s.setSize(e,t),c!==null&&c.setSize(e,t),l!==null&&l.setSize(e,t);for(let n=0;n<x.length;n++){let r=x[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){x=e,S=x.length>0&&x[0].isRenderPass===!0;let t=s.width,n=s.height;x.length>0&&c===null&&(c=new Ue(t,n,{type:ie,depthBuffer:!1,stencilBuffer:!1}),l=new Ue(t,n,{type:ie,depthBuffer:!1,stencilBuffer:!1}));for(let e=0;e<x.length;e++){let r=x[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(v||e.toneMapping===0&&x.length===0)return!1;if(b=t,t!==null){let e=t.width,n=t.height;(s.width!==e||s.height!==n)&&this.setSize(e,n)}return S===!1&&e.setRenderTarget(s),y=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return S},this.end=function(e,t){e.toneMapping=y,v=!0;let n=s,r=c;for(let i=0;i<x.length;i++){let a=x[i];a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1&&(n=r,r=r===c?l:c))}if(h!==e.outputColorSpace||_!==e.toneMapping){h=e.outputColorSpace,_=e.toneMapping,d.defines={},V.getTransfer(h)===`srgb`&&(d.defines.SRGB_TRANSFER=``);let t=Pt[_];t&&(d.defines[t]=``),d.needsUpdate=!0}d.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(b),e.render(f,m),b=null,v=!1},this.isCompositing=function(){return v},this.dispose=function(){s.dispose(),c!==null&&c.dispose(),l!==null&&l.dispose(),u.dispose(),d.dispose()}}var It=new Fe,Lt=new T(1,1),Rt=new Be,zt=new a,Bt=new R,Vt=[],Ht=[],Ut=new Float32Array(16),Wt=new Float32Array(9),Gt=new Float32Array(4);function Kt(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=Vt[i];if(a===void 0&&(a=new Float32Array(i),Vt[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function qt(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function Jt(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function Yt(e,t){let n=Ht[t];n===void 0&&(n=new Int32Array(t),Ht[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function Xt(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function Zt(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(qt(n,t))return;e.uniform2fv(this.addr,t),Jt(n,t)}}function Qt(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(qt(n,t))return;e.uniform3fv(this.addr,t),Jt(n,t)}}function $t(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(qt(n,t))return;e.uniform4fv(this.addr,t),Jt(n,t)}}function en(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(qt(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Jt(n,t)}else{if(qt(n,r))return;Gt.set(r),e.uniformMatrix2fv(this.addr,!1,Gt),Jt(n,r)}}function tn(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(qt(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Jt(n,t)}else{if(qt(n,r))return;Wt.set(r),e.uniformMatrix3fv(this.addr,!1,Wt),Jt(n,r)}}function nn(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(qt(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Jt(n,t)}else{if(qt(n,r))return;Ut.set(r),e.uniformMatrix4fv(this.addr,!1,Ut),Jt(n,r)}}function rn(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function an(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(qt(n,t))return;e.uniform2iv(this.addr,t),Jt(n,t)}}function on(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(qt(n,t))return;e.uniform3iv(this.addr,t),Jt(n,t)}}function sn(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(qt(n,t))return;e.uniform4iv(this.addr,t),Jt(n,t)}}function cn(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function ln(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(qt(n,t))return;e.uniform2uiv(this.addr,t),Jt(n,t)}}function un(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(qt(n,t))return;e.uniform3uiv(this.addr,t),Jt(n,t)}}function dn(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(qt(n,t))return;e.uniform4uiv(this.addr,t),Jt(n,t)}}function fn(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(Lt.compareFunction=n.isReversedDepthBuffer()?518:515,a=Lt):a=It,n.setTexture2D(t||a,i)}function pn(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||zt,i)}function mn(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||Bt,i)}function hn(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||Rt,i)}function gn(e){switch(e){case 5126:return Xt;case 35664:return Zt;case 35665:return Qt;case 35666:return $t;case 35674:return en;case 35675:return tn;case 35676:return nn;case 5124:case 35670:return rn;case 35667:case 35671:return an;case 35668:case 35672:return on;case 35669:case 35673:return sn;case 5125:return cn;case 36294:return ln;case 36295:return un;case 36296:return dn;case 35678:case 36198:case 36298:case 36306:case 35682:return fn;case 35679:case 36299:case 36307:return pn;case 35680:case 36300:case 36308:case 36293:return mn;case 36289:case 36303:case 36311:case 36292:return hn}}function _n(e,t){e.uniform1fv(this.addr,t)}function vn(e,t){let n=Kt(t,this.size,2);e.uniform2fv(this.addr,n)}function yn(e,t){let n=Kt(t,this.size,3);e.uniform3fv(this.addr,n)}function bn(e,t){let n=Kt(t,this.size,4);e.uniform4fv(this.addr,n)}function xn(e,t){let n=Kt(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function Sn(e,t){let n=Kt(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function Cn(e,t){let n=Kt(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function wn(e,t){e.uniform1iv(this.addr,t)}function Tn(e,t){e.uniform2iv(this.addr,t)}function En(e,t){e.uniform3iv(this.addr,t)}function Dn(e,t){e.uniform4iv(this.addr,t)}function On(e,t){e.uniform1uiv(this.addr,t)}function kn(e,t){e.uniform2uiv(this.addr,t)}function An(e,t){e.uniform3uiv(this.addr,t)}function jn(e,t){e.uniform4uiv(this.addr,t)}function Mn(e,t,n){let r=this.cache,i=t.length,a=Yt(n,i);qt(r,a)||(e.uniform1iv(this.addr,a),Jt(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?Lt:It;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function Nn(e,t,n){let r=this.cache,i=t.length,a=Yt(n,i);qt(r,a)||(e.uniform1iv(this.addr,a),Jt(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||zt,a[e])}function Pn(e,t,n){let r=this.cache,i=t.length,a=Yt(n,i);qt(r,a)||(e.uniform1iv(this.addr,a),Jt(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||Bt,a[e])}function Fn(e,t,n){let r=this.cache,i=t.length,a=Yt(n,i);qt(r,a)||(e.uniform1iv(this.addr,a),Jt(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||Rt,a[e])}function In(e){switch(e){case 5126:return _n;case 35664:return vn;case 35665:return yn;case 35666:return bn;case 35674:return xn;case 35675:return Sn;case 35676:return Cn;case 5124:case 35670:return wn;case 35667:case 35671:return Tn;case 35668:case 35672:return En;case 35669:case 35673:return Dn;case 5125:return On;case 36294:return kn;case 36295:return An;case 36296:return jn;case 35678:case 36198:case 36298:case 36306:case 35682:return Mn;case 35679:case 36299:case 36307:return Nn;case 35680:case 36300:case 36308:case 36293:return Pn;case 36289:case 36303:case 36311:case 36292:return Fn}}var Ln=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=gn(t.type)}},Rn=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=In(t.type)}},zn=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},Bn=/(\w+)(\])?(\[|\.)?/g;function Vn(e,t){e.seq.push(t),e.map[t.id]=t}function Hn(e,t,n){let r=e.name,i=r.length;for(Bn.lastIndex=0;;){let a=Bn.exec(r),o=Bn.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){Vn(n,l===void 0?new Ln(s,e,t):new Rn(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new zn(s),Vn(n,e)),n=e}}}var Un=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);Hn(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function Wn(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var Gn=37297,Kn=0;function qn(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var Jn=new X;function Yn(e){V._getMatrix(Jn,V.workingColorSpace,e);let t=`mat3( ${Jn.elements.map(e=>e.toFixed(4))} )`;switch(V.getTransfer(e)){case B:return[t,`LinearTransferOETF`];case F:return[t,`sRGBTransferOETF`];default:return b(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function Xn(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+qn(e.getShaderSource(t),r)}return i}function Zn(e,t){let n=Yn(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var Qn={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function $n(e,t){let n=Qn[t];return n===void 0?(b(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var er=new I;function tr(){return V.getLuminanceCoefficients(er),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${er.x.toFixed(4)}, ${er.y.toFixed(4)}, ${er.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function nr(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(ar).join(`
`)}function rr(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function ir(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function ar(e){return e!==``}function or(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function sr(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var cr=/^[ \t]*#include +<([\w\d./]+)>/gm;function lr(e){return e.replace(cr,dr)}var ur=new Map;function dr(e,t){let n=Z[t];if(n===void 0){let e=ur.get(t);if(e!==void 0)n=Z[e],b(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`THREE.WebGLProgram: Can not resolve #include <`+t+`>`)}return lr(n)}var fr=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function pr(e){return e.replace(fr,mr)}function mr(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function hr(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var gr={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function _r(e){return gr[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var vr={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function yr(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:vr[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var br={302:`ENVMAP_MODE_REFRACTION`};function xr(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:br[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var Sr={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function Cr(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:Sr[e.combine]||`ENVMAP_BLENDING_NONE`}function wr(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function Tr(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=_r(n),l=yr(n),u=xr(n),d=Cr(n),p=wr(n),m=nr(n),h=rr(a),g=i.createProgram(),_,v,y=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,h].filter(ar).join(`
`),_.length>0&&(_+=`
`),v=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,h].filter(ar).join(`
`),v.length>0&&(v+=`
`)):(_=[hr(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,h,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexNormals?`#define HAS_NORMAL`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(ar).join(`
`),v=[hr(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,h,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,p?`#define CUBEUV_TEXEL_WIDTH `+p.texelWidth:``,p?`#define CUBEUV_TEXEL_HEIGHT `+p.texelHeight:``,p?`#define CUBEUV_MAX_MIP `+p.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.packedNormalMap?`#define USE_PACKED_NORMALMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.retroreflection?`#define USE_RETROREFLECTION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.numLightProbeGrids>0?`#define USE_LIGHT_PROBES_GRID`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:Z.tonemapping_pars_fragment,n.toneMapping===0?``:$n(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,Z.colorspace_pars_fragment,Zn(`linearToOutputTexel`,n.outputColorSpace),tr(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(ar).join(`
`)),o=lr(o),o=or(o,n),o=sr(o,n),s=lr(s),s=or(s,n),s=sr(s,n),o=pr(o),s=pr(s),n.isRawShaderMaterial!==!0&&(y=`#version 300 es
`,_=[m,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+_,v=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+v);let x=y+_+o,S=y+v+s,C=Wn(i,i.VERTEX_SHADER,x),w=Wn(i,i.FRAGMENT_SHADER,S);i.attachShader(g,C),i.attachShader(g,w),n.index0AttributeName===void 0?n.hasPositionAttribute===!0&&i.bindAttribLocation(g,0,`position`):i.bindAttribLocation(g,0,n.index0AttributeName),i.linkProgram(g);function T(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(g)||``,r=i.getShaderInfoLog(C)||``,a=i.getShaderInfoLog(w)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(g,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,g,C,w);else{let e=Xn(i,C,`vertex`),n=Xn(i,w,`fragment`);f(`WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(g,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):b(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:_},fragmentShader:{log:c,prefix:v}})}i.deleteShader(C),i.deleteShader(w),E=new Un(i,g),D=ir(i,g)}let E;this.getUniforms=function(){return E===void 0&&T(this),E};let D;this.getAttributes=function(){return D===void 0&&T(this),D};let O=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return O===!1&&(O=i.getProgramParameter(g,Gn)),O},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(g),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=Kn++,this.cacheKey=t,this.usedTimes=1,this.program=g,this.vertexShader=C,this.fragmentShader=w,this}var Er=0,Dr=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(n)===!1&&(r.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new Or(e),t.set(e,n)),n}},Or=class{constructor(e){this.id=Er++,this.code=e,this.usedTimes=0}};function kr(e){return e===1030||e===37490||e===36285}function Ar(e,t,n,r,i,a){let o=new J,s=new Dr,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h,g){let _=u.fog,v=h.geometry,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,x=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,S=t.get(i.envMap||y,x),C=S&&S.mapping===306?S.image.height:null,w=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&b(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let T=v.morphAttributes.position||v.morphAttributes.normal||v.morphAttributes.color,E=T===void 0?0:T.length,D=0;v.morphAttributes.position!==void 0&&(D=1),v.morphAttributes.normal!==void 0&&(D=2),v.morphAttributes.color!==void 0&&(D=3);let O,k,A,ee;if(w){let e=Xe[w];O=e.vertexShader,k=e.fragmentShader}else{O=i.vertexShader,k=i.fragmentShader;let e=s.getVertexShaderStage(i),t=s.getFragmentShaderStage(i);s.update(i,e,t),A=e.id,ee=t.id}let j=e.getRenderTarget(),M=e.state.buffers.depth.getReversed(),te=h.isInstancedMesh===!0,N=h.isBatchedMesh===!0,ne=!!i.map,re=!!i.matcap,P=!!S,ie=!!i.aoMap,F=!!i.lightMap,ae=!!i.bumpMap&&i.wireframe===!1,oe=!!i.normalMap,se=!!i.displacementMap,ce=!!i.emissiveMap,I=!!i.metalnessMap,L=!!i.roughnessMap,le=i.anisotropy>0,R=i.clearcoat>0,ue=i.dispersion>0,z=i.retroreflectivity>0,de=i.iridescence>0,fe=i.sheen>0,pe=i.transmission>0,B=le&&!!i.anisotropyMap,me=R&&!!i.clearcoatMap,he=R&&!!i.clearcoatNormalMap,ge=R&&!!i.clearcoatRoughnessMap,H=de&&!!i.iridescenceMap,U=de&&!!i.iridescenceThicknessMap,_e=fe&&!!i.sheenColorMap,ve=fe&&!!i.sheenRoughnessMap,W=!!i.specularMap,ye=!!i.specularColorMap,be=!!i.specularIntensityMap,xe=pe&&!!i.transmissionMap,Se=pe&&!!i.thicknessMap,Ce=!!i.gradientMap,we=!!i.alphaMap,Te=i.alphaTest>0,G=!!i.alphaHash,Ee=!!i.extensions,De=0;i.toneMapped&&(j===null||j.isXRRenderTarget===!0)&&(De=e.toneMapping);let Oe={shaderID:w,shaderType:i.type,shaderName:i.name,vertexShader:O,fragmentShader:k,defines:i.defines,customVertexShaderID:A,customFragmentShaderID:ee,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:N,batchingColor:N&&h._colorsTexture!==null,instancing:te,instancingColor:te&&h.instanceColor!==null,instancingMorph:te&&h.morphTexture!==null,outputColorSpace:j===null?e.outputColorSpace:j.isXRRenderTarget===!0?j.texture.colorSpace:V.workingColorSpace,alphaToCoverage:!!i.alphaToCoverage,map:ne,matcap:re,envMap:P,envMapMode:P&&S.mapping,envMapCubeUVHeight:C,aoMap:ie,lightMap:F,bumpMap:ae,normalMap:oe,displacementMap:se,emissiveMap:ce,normalMapObjectSpace:oe&&i.normalMapType===1,normalMapTangentSpace:oe&&i.normalMapType===0,packedNormalMap:oe&&i.normalMapType===0&&kr(i.normalMap.format),metalnessMap:I,roughnessMap:L,anisotropy:le,anisotropyMap:B,clearcoat:R,clearcoatMap:me,clearcoatNormalMap:he,clearcoatRoughnessMap:ge,dispersion:ue,retroreflection:z,iridescence:de,iridescenceMap:H,iridescenceThicknessMap:U,sheen:fe,sheenColorMap:_e,sheenRoughnessMap:ve,specularMap:W,specularColorMap:ye,specularIntensityMap:be,transmission:pe,transmissionMap:xe,thicknessMap:Se,gradientMap:Ce,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:we,alphaTest:Te,alphaHash:G,combine:i.combine,mapUv:ne&&m(i.map.channel),aoMapUv:ie&&m(i.aoMap.channel),lightMapUv:F&&m(i.lightMap.channel),bumpMapUv:ae&&m(i.bumpMap.channel),normalMapUv:oe&&m(i.normalMap.channel),displacementMapUv:se&&m(i.displacementMap.channel),emissiveMapUv:ce&&m(i.emissiveMap.channel),metalnessMapUv:I&&m(i.metalnessMap.channel),roughnessMapUv:L&&m(i.roughnessMap.channel),anisotropyMapUv:B&&m(i.anisotropyMap.channel),clearcoatMapUv:me&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:he&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ge&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:H&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:U&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:_e&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:ve&&m(i.sheenRoughnessMap.channel),specularMapUv:W&&m(i.specularMap.channel),specularColorMapUv:ye&&m(i.specularColorMap.channel),specularIntensityMapUv:be&&m(i.specularIntensityMap.channel),transmissionMapUv:xe&&m(i.transmissionMap.channel),thicknessMapUv:Se&&m(i.thicknessMap.channel),alphaMapUv:we&&m(i.alphaMap.channel),vertexTangents:!!v.attributes.tangent&&(oe||le),vertexNormals:!!v.attributes.normal,vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!v.attributes.color&&v.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!v.attributes.uv&&(ne||we),fog:!!_,useFog:i.fog===!0,fogExp2:!!_&&_.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||v.attributes.normal===void 0&&oe===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:M,skinning:h.isSkinnedMesh===!0,hasPositionAttribute:v.attributes.position!==void 0,morphTargets:v.morphAttributes.position!==void 0,morphNormals:v.morphAttributes.normal!==void 0,morphColors:v.morphAttributes.color!==void 0,morphTargetsCount:E,morphTextureStride:D,numSunLights:o.sun.length,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numSunLightShadows:o.sunShadowMap.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numLightProbeGrids:g.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:De,decodeVideoTexture:ne&&i.map.isVideoTexture===!0&&V.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:ce&&i.emissiveMap.isVideoTexture===!0&&V.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:Ee&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(Ee&&i.extensions.multiDraw===!0||N)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return Oe.vertexUv1s=c.has(1),Oe.vertexUv2s=c.has(2),Oe.vertexUv3s=c.has(3),c.clear(),Oe}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numSunLights),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numSunLightShadows),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.retroreflection&&o.enable(24),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),t.packedNormalMap&&o.enable(22),t.vertexNormals&&o.enable(23),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),t.numLightProbeGrids>0&&o.enable(22),t.hasPositionAttribute&&o.enable(23),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=Xe[t];n=Pe.clone(e.uniforms)}else n=e.uniforms;return n}function x(t,n){let r=u.get(n);return r===void 0?(r=new Tr(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function S(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function C(e){s.remove(e)}function w(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:x,releaseProgram:S,releaseShaderCache:C,programs:l,dispose:w}}function jr(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function Mr(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Nr(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function Pr(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l,u){u.reversedDepth===!0&&(c=-c);let d=s(e,t,a,o,c,l);a.transmission>0?r.push(d):a.transparent===!0?i.push(d):n.push(d)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t){n.length>1&&n.sort(e||Mr),r.length>1&&r.sort(t||Nr),i.length>1&&i.sort(t||Nr)}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function Fr(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new Pr,e.set(t,[i])):n>=r.length?(i=new Pr,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function Ir(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={direction:new I,color:new U};break;case`SpotLight`:n={position:new I,direction:new I,color:new U,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new I,color:new U,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new I,skyColor:new U,groundColor:new U};break;case`RectAreaLight`:n={color:new U,position:new I,halfWidth:new I,halfHeight:new I}}return e[t.id]=n,n}}}function Lr(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new H};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new H};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new H,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var Rr=0;function zr(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function Br(e){let t=new Ir,n=Lr(),r={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new I);let i=new I,a=new Ke,o=new Ke;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;i.sort(zr);for(let e=0,S=i.length;e<S;e++){let S=i[e],C=S.color,w=S.intensity,T=S.distance,E=null;if(S.shadow&&S.shadow.map&&(E=S.shadow.map.texture.format===1030?S.shadow.map.texture:S.shadow.map.depthTexture||S.shadow.map.texture),S.isAmbientLight)a+=C.r*w,o+=C.g*w,s+=C.b*w;else if(S.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(S.sh.coefficients[e],w);x++}else if(S.isSunLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize.copy(e.mapSize).multiply(e.getFrameExtents()),r.sunShadow[l]=t,r.sunShadowMap[l]=E;let i=e.getViewportCount();for(let t=0;t<i;t++)r.sunShadowMatrix[u+t]=e.getMatrix(t),r.sunShadowCascade[u+t]=e._cascadeData[t];u+=i,l++}r.sun[c]=e,c++}else if(S.isDirectionalLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[d]=t,r.directionalShadowMap[d]=E,r.directionalShadowMatrix[d]=S.shadow.matrix,g++}r.directional[d]=e,d++}else if(S.isSpotLight){let e=t.get(S);e.position.setFromMatrixPosition(S.matrixWorld),e.color.copy(C).multiplyScalar(w),e.distance=T,e.coneCos=Math.cos(S.angle),e.penumbraCos=Math.cos(S.angle*(1-S.penumbra)),e.decay=S.decay,r.spot[p]=e;let i=S.shadow;if(S.map&&(r.spotLightMap[y]=S.map,y++,i.updateMatrices(S),S.castShadow&&b++),r.spotLightMatrix[p]=i.matrix,S.castShadow){let e=n.get(S);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[p]=e,r.spotShadowMap[p]=E,v++}p++}else if(S.isRectAreaLight){let e=t.get(S);e.color.copy(C).multiplyScalar(w),e.halfWidth.set(S.width*.5,0,0),e.halfHeight.set(0,S.height*.5,0),r.rectArea[m]=e,m++}else if(S.isPointLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),e.distance=S.distance,e.decay=S.decay,S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[f]=t,r.pointShadowMap[f]=E,r.pointShadowMatrix[f]=S.shadow.matrix,_++}r.point[f]=e,f++}else if(S.isHemisphereLight){let e=t.get(S);e.skyColor.copy(S.color).multiplyScalar(w),e.groundColor.copy(S.groundColor).multiplyScalar(w),r.hemi[h]=e,h++}}m>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=Q.LTC_FLOAT_1,r.rectAreaLTC2=Q.LTC_FLOAT_2):(r.rectAreaLTC1=Q.LTC_HALF_1,r.rectAreaLTC2=Q.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let S=r.hash;(S.sunLength!==c||S.directionalLength!==d||S.pointLength!==f||S.spotLength!==p||S.rectAreaLength!==m||S.hemiLength!==h||S.numSunShadows!==l||S.numDirectionalShadows!==g||S.numPointShadows!==_||S.numSpotShadows!==v||S.numSpotMaps!==y||S.numLightProbes!==x)&&(r.sun.length=c,r.directional.length=d,r.spot.length=p,r.rectArea.length=m,r.point.length=f,r.hemi.length=h,r.sunShadow.length=l,r.sunShadowMap.length=l,r.sunShadowMatrix.length=u,r.sunShadowCascade.length=u,r.directionalShadow.length=g,r.directionalShadowMap.length=g,r.directionalShadowMatrix.length=g,r.pointShadow.length=_,r.pointShadowMap.length=_,r.pointShadowMatrix.length=_,r.spotShadow.length=v,r.spotShadowMap.length=v,r.spotLightMatrix.length=v+y-b,r.spotLightMap.length=y,r.numSpotLightShadowsWithMaps=b,r.numLightProbes=x,S.sunLength=c,S.directionalLength=d,S.pointLength=f,S.spotLength=p,S.rectAreaLength=m,S.hemiLength=h,S.numSunShadows=l,S.numDirectionalShadows=g,S.numPointShadows=_,S.numSpotShadows=v,S.numSpotMaps=y,S.numLightProbes=x,r.version=Rr++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=0,f=t.matrixWorldInverse;for(let t=0,p=e.length;t<p;t++){let p=e[t];if(p.isSunLight){let e=r.sun[n];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),n++}else if(p.isDirectionalLight){let e=r.directional[s];e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),s++}else if(p.isSpotLight){let e=r.spot[l];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),l++}else if(p.isRectAreaLight){let e=r.rectArea[u];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),o.identity(),a.copy(p.matrixWorld),a.premultiply(f),o.extractRotation(a),e.halfWidth.set(p.width*.5,0,0),e.halfHeight.set(0,p.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),u++}else if(p.isPointLight){let e=r.point[c];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),c++}else if(p.isHemisphereLight){let e=r.hemi[d];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),d++}}}return{setup:s,setupView:c,state:r}}function Vr(e){let t=new Br(e),n=[],r=[],i=[];function a(e){d.camera=e,n.length=0,r.length=0,i.length=0}function o(e){n.push(e)}function s(e){r.push(e)}function c(e){i.push(e)}function l(){t.setup(n)}function u(e){t.setupView(n,e)}let d={lightsArray:n,shadowsArray:r,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:s,pushLightProbeGrid:c}}function Hr(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new Vr(e),t.set(n,[a])):r>=i.length?(a=new Vr(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var Ur=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Wr=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Gr=[new I(1,0,0),new I(-1,0,0),new I(0,1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1)],Kr=[new I(0,-1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1),new I(0,-1,0),new I(0,-1,0)],qr=new Ke,Jr=new I,Yr=new I;function Xr(e,t,r){let i=new j,a=new H,o=new H,c=new ze,l=new N,u=new s,f={},p=r.maxTextureSize,m={0:1,1:0,2:2},g=new P({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new H},radius:{value:4}},vertexShader:Ur,fragmentShader:Wr}),_=g.clone();_.defines.HORIZONTAL_PASS=1;let v=new Y;v.setAttribute(`position`,new G(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new z(v,g),x=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let S=this.type;this.render=function(t,r,s){if(x.enabled===!1||x.autoUpdate===!1&&x.needsUpdate===!1||t.length===0)return;this.type===2&&(b(`WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`),this.type=1);let l=e.getRenderTarget(),u=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),m=e.state;m.setBlending(0),m.buffers.depth.getReversed()===!0?m.buffers.color.setClear(0,0,0,0):m.buffers.color.setClear(1,1,1,1),m.buffers.depth.setTest(!0),m.setScissorTest(!1);let g=S!==this.type;g&&r.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let l=0,u=t.length;l<u;l++){let u=t[l],f=u.shadow;if(f===void 0){b(`WebGLShadowMap:`,u,`has no shadow.`);continue}if(f.autoUpdate===!1&&f.needsUpdate===!1)continue;a.copy(f.mapSize);let _=f.getFrameExtents();a.multiply(_),o.copy(f.mapSize),(a.x>p||a.y>p)&&(a.x>p&&(o.x=Math.floor(p/_.x),a.x=o.x*_.x,f.mapSize.x=o.x),a.y>p&&(o.y=Math.floor(p/_.y),a.y=o.y*_.y,f.mapSize.y=o.y));let v=e.state.buffers.depth.getReversed();if(f.camera._reversedDepth=v,f.map===null||g===!0){if(f.map!==null&&(f.map.depthTexture!==null&&(f.map.depthTexture.dispose(),f.map.depthTexture=null),f.map.dispose()),this.type===3){if(u.isPointLight){b(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}f.map=new Ue(a.x,a.y,{format:E,type:ie,minFilter:q,magFilter:q,generateMipmaps:!1}),f.map.texture.name=u.name+`.shadowMap`,f.map.depthTexture=new T(a.x,a.y,h),f.map.depthTexture.name=u.name+`.shadowMapDepth`,f.map.depthTexture.format=d,f.map.depthTexture.compareFunction=null,f.map.depthTexture.minFilter=n,f.map.depthTexture.magFilter=n}else u.isPointLight?(f.map=new Et(a.x),f.map.depthTexture=new Ge(a.x,ge)):(f.map=new Ue(a.x,a.y),f.map.depthTexture=new T(a.x,a.y,ge)),f.map.depthTexture.name=u.name+`.shadowMap`,f.map.depthTexture.format=d,this.type===1?(f.map.depthTexture.compareFunction=v?518:515,f.map.depthTexture.minFilter=q,f.map.depthTexture.magFilter=q):(f.map.depthTexture.compareFunction=null,f.map.depthTexture.minFilter=n,f.map.depthTexture.magFilter=n);f.camera.updateProjectionMatrix()}f.map.isWebGLCubeRenderTarget!==!0&&(f.map.width!==a.x||f.map.height!==a.y)&&f.map.setSize(a.x,a.y);let y=f.map.isWebGLCubeRenderTarget?6:f.getViewportCount();u.isPointLight!==!0&&f.updateMatrices(u,s);for(let t=0;t<y;t++){let n=f.getCamera(t);if(u.isPointLight){let e=f.camera,n=f.matrix,r=u.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),Jr.setFromMatrixPosition(u.matrixWorld),e.position.copy(Jr),Yr.copy(e.position),Yr.add(Gr[t]),e.up.copy(Kr[t]),e.lookAt(Yr),e.updateMatrixWorld(),n.makeTranslation(-Jr.x,-Jr.y,-Jr.z),qr.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),f._frustum.setFromProjectionMatrix(qr,e.coordinateSystem,e.reversedDepth)}if(f.map.isWebGLCubeRenderTarget)e.setRenderTarget(f.map,t),e.clear();else{t===0&&(e.setRenderTarget(f.map),e.clear());let n=f.getViewport(t);c.set(o.x*n.x,o.y*n.y,o.x*n.z,o.y*n.w),m.viewport(c)}i=f.getFrustum(t),D(r,s,n,u,this.type)}f.isPointLightShadow!==!0&&this.type===3&&C(f,s),f.needsUpdate=!1}S=this.type,x.needsUpdate=!1,e.setRenderTarget(l,u,f)};function C(n,r){let i=t.update(y);g.defines.VSM_SAMPLES!==n.blurSamples&&(g.defines.VSM_SAMPLES=n.blurSamples,_.defines.VSM_SAMPLES=n.blurSamples,g.needsUpdate=!0,_.needsUpdate=!0),n.mapPass===null?n.mapPass=new Ue(a.x,a.y,{format:E,type:ie}):(n.mapPass.width!==n.map.width||n.mapPass.height!==n.map.height)&&n.mapPass.setSize(n.map.width,n.map.height),g.uniforms.shadow_pass.value=n.map.depthTexture,g.uniforms.resolution.value.set(n.map.width,n.map.height),g.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,i,g,y,null),_.uniforms.shadow_pass.value=n.mapPass.texture,_.uniforms.resolution.value.set(n.map.width,n.map.height),_.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,i,_,y,null)}function w(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?u:l,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=f[e];r===void 0&&(r={},f[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,O)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?m[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function D(n,r,a,o,s){if(n.visible===!1)return;if(n.layers.test(r.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||n.intersectsFrustum(i))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let i=t.update(n),c=n.material;if(Array.isArray(c)){let t=i.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=w(n,d,o,s);n.onBeforeShadow(e,n,r,a,i,t,u),e.renderBufferDirect(a,null,i,t,n,u),n.onAfterShadow(e,n,r,a,i,t,u)}}}else if(c.visible){let t=w(n,c,o,s);n.onBeforeShadow(e,n,r,a,i,t,null),e.renderBufferDirect(a,null,i,t,n,null),n.onAfterShadow(e,n,r,a,i,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)D(c[e],r,a,o,s)}function O(e){e.target.removeEventListener(`dispose`,O);for(let t in f){let n=f[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function Zr(e,t){function n(){let t=!1,n=new ze,r=null,i=new ze(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?L(e.DEPTH_TEST):le(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=m[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?L(e.STENCIL_TEST):le(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},p={},h=new WeakMap,g=[],_=null,v=!1,y=null,b=null,x=null,S=null,C=null,w=null,T=null,E=new U(0,0,0),D=0,O=!1,k=null,A=null,ee=null,j=null,M=null,te=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),N=!1,ne=0,re=e.getParameter(e.VERSION);re.indexOf(`WebGL`)===-1?re.indexOf(`OpenGL ES`)!==-1&&(ne=parseFloat(/^OpenGL ES (\d)/.exec(re)[1]),N=ne>=2):(ne=parseFloat(/^WebGL (\d)/.exec(re)[1]),N=ne>=1);let P=null,ie={},F=e.getParameter(e.SCISSOR_BOX),ae=e.getParameter(e.VIEWPORT),oe=new ze().fromArray(F),se=new ze().fromArray(ae);function ce(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let I={};I[e.TEXTURE_2D]=ce(e.TEXTURE_2D,e.TEXTURE_2D,1),I[e.TEXTURE_CUBE_MAP]=ce(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),I[e.TEXTURE_2D_ARRAY]=ce(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),I[e.TEXTURE_3D]=ce(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),L(e.DEPTH_TEST),o.setFunc(3),me(!1),he(1),L(e.CULL_FACE),pe(0);function L(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function le(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function R(t,n){return p[t]!==n&&(e.bindFramebuffer(t,n),p[t]=n,t===e.DRAW_FRAMEBUFFER&&(p[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(p[e.DRAW_FRAMEBUFFER]=n),!0)}function ue(t,n){let r=g,i=!1;if(t){r=h.get(n),r===void 0&&(r=[],h.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function z(t){return _!==t&&(e.useProgram(t),_=t,!0)}let de={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};de[103]=e.MIN,de[104]=e.MAX;let fe={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function pe(t,n,r,i,a,o,s,c,l,u){if(t===0)v===!0&&(le(e.BLEND),v=!1);else if(v===!1&&(L(e.BLEND),v=!0),t!==5){if(t!==y||u!==O){if((b!==100||C!==100)&&(e.blendEquation(e.FUNC_ADD),b=100,C=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:f(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:f(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:f(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:f(`WebGLState: Invalid blending: `,t)}x=null,S=null,w=null,T=null,E.set(0,0,0),D=0,y=t,O=u}}else a||=n,o||=r,s||=i,(n!==b||a!==C)&&(e.blendEquationSeparate(de[n],de[a]),b=n,C=a),(r!==x||i!==S||o!==w||s!==T)&&(e.blendFuncSeparate(fe[r],fe[i],fe[o],fe[s]),x=r,S=i,w=o,T=s),(c.equals(E)===!1||l!==D)&&(e.blendColor(c.r,c.g,c.b,l),E.copy(c),D=l),y=t,O=!1}function B(t,n){t.side===2?le(e.CULL_FACE):L(e.CULL_FACE);let r=t.side===1;n&&(r=!r),me(r),t.blending===1&&t.transparent===!1?pe(0):pe(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),V(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?L(e.SAMPLE_ALPHA_TO_COVERAGE):le(e.SAMPLE_ALPHA_TO_COVERAGE)}function me(t){k!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),k=t)}function he(t){t===0?le(e.CULL_FACE):(L(e.CULL_FACE),t!==A&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),A=t}function ge(t){t!==ee&&(N&&e.lineWidth(t),ee=t)}function V(t,n,r){t?(L(e.POLYGON_OFFSET_FILL),(j!==n||M!==r)&&(j=n,M=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):le(e.POLYGON_OFFSET_FILL)}function H(t){t?L(e.SCISSOR_TEST):le(e.SCISSOR_TEST)}function _e(t){t===void 0&&(t=e.TEXTURE0+te-1),P!==t&&(e.activeTexture(t),P=t)}function ve(t,n,r){r===void 0&&(r=P===null?e.TEXTURE0+te-1:P);let i=ie[r];i===void 0&&(i={type:void 0,texture:void 0},ie[r]=i),(i.type!==t||i.texture!==n)&&(P!==r&&(e.activeTexture(r),P=r),e.bindTexture(t,n||I[t]),i.type=t,i.texture=n)}function W(){let t=ie[P];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function ye(){try{e.compressedTexImage2D(...arguments)}catch(e){f(`WebGLState:`,e)}}function be(){try{e.compressedTexImage3D(...arguments)}catch(e){f(`WebGLState:`,e)}}function xe(){try{e.texSubImage2D(...arguments)}catch(e){f(`WebGLState:`,e)}}function Se(){try{e.texSubImage3D(...arguments)}catch(e){f(`WebGLState:`,e)}}function Ce(){try{e.compressedTexSubImage2D(...arguments)}catch(e){f(`WebGLState:`,e)}}function we(){try{e.compressedTexSubImage3D(...arguments)}catch(e){f(`WebGLState:`,e)}}function Te(){try{e.texStorage2D(...arguments)}catch(e){f(`WebGLState:`,e)}}function G(){try{e.texStorage3D(...arguments)}catch(e){f(`WebGLState:`,e)}}function Ee(){try{e.texImage2D(...arguments)}catch(e){f(`WebGLState:`,e)}}function De(){try{e.texImage3D(...arguments)}catch(e){f(`WebGLState:`,e)}}function Oe(t){return d[t]===void 0?e.getParameter(t):d[t]}function ke(t,n){d[t]!==n&&(e.pixelStorei(t,n),d[t]=n)}function Ae(t){oe.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),oe.copy(t))}function K(t){se.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),se.copy(t))}function je(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function Me(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function Ne(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},P=null,ie={},p={},h=new WeakMap,g=[],_=null,v=!1,y=null,b=null,x=null,S=null,C=null,w=null,T=null,E=new U(0,0,0),D=0,O=!1,k=null,A=null,ee=null,j=null,M=null,oe.set(0,0,e.canvas.width,e.canvas.height),se.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:L,disable:le,bindFramebuffer:R,drawBuffers:ue,useProgram:z,setBlending:pe,setMaterial:B,setFlipSided:me,setCullFace:he,setLineWidth:ge,setPolygonOffset:V,setScissorTest:H,activeTexture:_e,bindTexture:ve,unbindTexture:W,compressedTexImage2D:ye,compressedTexImage3D:be,texImage2D:Ee,texImage3D:De,pixelStorei:ke,getParameter:Oe,updateUBOMapping:je,uniformBlockBinding:Me,texStorage2D:Te,texStorage3D:G,texSubImage2D:xe,texSubImage3D:Se,compressedTexSubImage2D:Ce,compressedTexSubImage3D:we,scissor:Ae,viewport:K,reset:Ne}}function Qr(e,t,r,i,a,o,s){let u=t.has(`WEBGL_multisampled_render_to_texture`)?t.get(`WEBGL_multisampled_render_to_texture`):null,d=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),p=new H,m=new WeakMap,h=new Set,g,_=new WeakMap,v=!1;try{v=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function y(e,t){return v?new OffscreenCanvas(e,t):re(`canvas`)}function S(e,t,n){let r=1,i=K(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);g===void 0&&(g=y(n,a));let o=t?y(n,a):g;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),b(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&b(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function C(e){return e.generateMipmaps}function w(t){e.generateMipmap(t)}function T(t){return t.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:t.isWebGL3DRenderTarget?e.TEXTURE_3D:t.isWebGLArrayRenderTarget||t.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function E(n,r,i,a,o,s=!1){if(n!==null){if(e[n]!==void 0)return e[n];b(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+n+`'`)}let c;a&&(c=t.get(`EXT_texture_norm16`),c||b(`WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension`));let l=r;if(r===e.RED&&(i===e.FLOAT&&(l=e.R32F),i===e.HALF_FLOAT&&(l=e.R16F),i===e.UNSIGNED_BYTE&&(l=e.R8),i===e.UNSIGNED_SHORT&&c&&(l=c.R16_EXT),i===e.SHORT&&c&&(l=c.R16_SNORM_EXT)),r===e.RED_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.R8UI),i===e.UNSIGNED_SHORT&&(l=e.R16UI),i===e.UNSIGNED_INT&&(l=e.R32UI),i===e.BYTE&&(l=e.R8I),i===e.SHORT&&(l=e.R16I),i===e.INT&&(l=e.R32I)),r===e.RG&&(i===e.FLOAT&&(l=e.RG32F),i===e.HALF_FLOAT&&(l=e.RG16F),i===e.UNSIGNED_BYTE&&(l=e.RG8),i===e.UNSIGNED_SHORT&&c&&(l=c.RG16_EXT),i===e.SHORT&&c&&(l=c.RG16_SNORM_EXT)),r===e.RG_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RG8UI),i===e.UNSIGNED_SHORT&&(l=e.RG16UI),i===e.UNSIGNED_INT&&(l=e.RG32UI),i===e.BYTE&&(l=e.RG8I),i===e.SHORT&&(l=e.RG16I),i===e.INT&&(l=e.RG32I)),r===e.RGB_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGB8UI),i===e.UNSIGNED_SHORT&&(l=e.RGB16UI),i===e.UNSIGNED_INT&&(l=e.RGB32UI),i===e.BYTE&&(l=e.RGB8I),i===e.SHORT&&(l=e.RGB16I),i===e.INT&&(l=e.RGB32I)),r===e.RGBA_INTEGER&&(i===e.UNSIGNED_BYTE&&(l=e.RGBA8UI),i===e.UNSIGNED_SHORT&&(l=e.RGBA16UI),i===e.UNSIGNED_INT&&(l=e.RGBA32UI),i===e.BYTE&&(l=e.RGBA8I),i===e.SHORT&&(l=e.RGBA16I),i===e.INT&&(l=e.RGBA32I)),r===e.RGB&&(i===e.UNSIGNED_SHORT&&c&&(l=c.RGB16_EXT),i===e.SHORT&&c&&(l=c.RGB16_SNORM_EXT),i===e.UNSIGNED_INT_5_9_9_9_REV&&(l=e.RGB9_E5),i===e.UNSIGNED_INT_10F_11F_11F_REV&&(l=e.R11F_G11F_B10F)),r===e.RGBA){let t=s?B:V.getTransfer(o);i===e.FLOAT&&(l=e.RGBA32F),i===e.HALF_FLOAT&&(l=e.RGBA16F),i===e.UNSIGNED_BYTE&&(l=t===`srgb`?e.SRGB8_ALPHA8:e.RGBA8),i===e.UNSIGNED_SHORT&&c&&(l=c.RGBA16_EXT),i===e.SHORT&&c&&(l=c.RGBA16_SNORM_EXT),i===e.UNSIGNED_SHORT_4_4_4_4&&(l=e.RGBA4),i===e.UNSIGNED_SHORT_5_5_5_1&&(l=e.RGB5_A1)}return(l===e.R16F||l===e.R32F||l===e.RG16F||l===e.RG32F||l===e.RGBA16F||l===e.RGBA32F)&&t.get(`EXT_color_buffer_float`),l}function D(t,n){let r;return t?n===null||n===1014||n===1020?r=e.DEPTH24_STENCIL8:n===1015?r=e.DEPTH32F_STENCIL8:n===1012&&(r=e.DEPTH24_STENCIL8,b(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):n===null||n===1014||n===1020?r=e.DEPTH_COMPONENT24:n===1015?r=e.DEPTH_COMPONENT32F:n===1012&&(r=e.DEPTH_COMPONENT16),r}function k(e,t){return C(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function A(e){let t=e.target;t.removeEventListener(`dispose`,A),j(t),t.isVideoTexture&&m.delete(t),t.isHTMLTexture&&h.delete(t)}function ee(e){let t=e.target;t.removeEventListener(`dispose`,ee),te(t)}function j(e){let t=i.get(e);if(t.__webglInit===void 0)return;let n=e.source,r=_.get(n);if(r){let i=r[t.__cacheKey];i.usedTimes--,i.usedTimes===0&&M(e),Object.keys(r).length===0&&_.delete(n)}i.remove(e)}function M(t){let n=i.get(t);e.deleteTexture(n.__webglTexture);let r=t.source,a=_.get(r);delete a[n.__cacheKey],s.memory.textures--}function te(t){let n=i.get(t);if(t.depthTexture&&(t.depthTexture.dispose(),i.remove(t.depthTexture)),t.isWebGLCubeRenderTarget)for(let t=0;t<6;t++){if(Array.isArray(n.__webglFramebuffer[t]))for(let r=0;r<n.__webglFramebuffer[t].length;r++)e.deleteFramebuffer(n.__webglFramebuffer[t][r]);else e.deleteFramebuffer(n.__webglFramebuffer[t]);n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer[t])}else{if(Array.isArray(n.__webglFramebuffer))for(let t=0;t<n.__webglFramebuffer.length;t++)e.deleteFramebuffer(n.__webglFramebuffer[t]);else e.deleteFramebuffer(n.__webglFramebuffer);if(n.__webglDepthbuffer&&e.deleteRenderbuffer(n.__webglDepthbuffer),n.__webglMultisampledFramebuffer&&e.deleteFramebuffer(n.__webglMultisampledFramebuffer),n.__webglColorRenderbuffer)for(let t=0;t<n.__webglColorRenderbuffer.length;t++)n.__webglColorRenderbuffer[t]&&e.deleteRenderbuffer(n.__webglColorRenderbuffer[t]);n.__webglDepthRenderbuffer&&e.deleteRenderbuffer(n.__webglDepthRenderbuffer)}let r=t.textures;for(let t=0,n=r.length;t<n;t++){let n=i.get(r[t]);n.__webglTexture&&(e.deleteTexture(n.__webglTexture),s.memory.textures--),i.remove(r[t])}i.remove(t)}let N=0;function ne(){N=0}function P(){return N}function ie(e){N=e}function F(){let e=N;return e>=a.maxTextures&&b(`WebGLTextures: Trying to use `+(e+1)+` texture units while this GPU supports only `+a.maxTextures),N+=1,e}function ae(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function oe(t,n){let a=i.get(t);if(t.isVideoTexture&&ke(t),t.isRenderTargetTexture===!1&&t.isExternalTexture!==!0&&t.version>0&&a.__version!==t.version){let e=t.image;if(e===null)b(`WebGLRenderer: Texture marked for update but no image data found.`);else if(e.complete===!1)b(`WebGLRenderer: Texture marked for update but image is incomplete`);else{me(a,t,n);return}}else t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null);r.bindTexture(e.TEXTURE_2D,a.__webglTexture,e.TEXTURE0+n)}function se(t,n){let a=i.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?me(a,t,n):(t.isExternalTexture&&(a.__webglTexture=t.sourceTexture?t.sourceTexture:null),r.bindTexture(e.TEXTURE_2D_ARRAY,a.__webglTexture,e.TEXTURE0+n))}function ce(t,n){let a=i.get(t);t.isRenderTargetTexture===!1&&t.version>0&&a.__version!==t.version?me(a,t,n):r.bindTexture(e.TEXTURE_3D,a.__webglTexture,e.TEXTURE0+n)}function I(t,n){let a=i.get(t);t.isCubeDepthTexture!==!0&&t.version>0&&a.__version!==t.version?he(a,t,n):r.bindTexture(e.TEXTURE_CUBE_MAP,a.__webglTexture,e.TEXTURE0+n)}let L={[O]:e.REPEAT,[De]:e.CLAMP_TO_EDGE,[Te]:e.MIRRORED_REPEAT},le={[n]:e.NEAREST,[x]:e.NEAREST_MIPMAP_NEAREST,[Se]:e.NEAREST_MIPMAP_LINEAR,[q]:e.LINEAR,[Ee]:e.LINEAR_MIPMAP_NEAREST,[pe]:e.LINEAR_MIPMAP_LINEAR},R={512:e.NEVER,519:e.ALWAYS,513:e.LESS,515:e.LEQUAL,514:e.EQUAL,518:e.GEQUAL,516:e.GREATER,517:e.NOTEQUAL};function ue(n,r){if(r.type===1015&&t.has(`OES_texture_float_linear`)===!1&&(r.magFilter===1006||r.magFilter===1007||r.magFilter===1005||r.magFilter===1008||r.minFilter===1006||r.minFilter===1007||r.minFilter===1005||r.minFilter===1008)&&b(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),e.texParameteri(n,e.TEXTURE_WRAP_S,L[r.wrapS]),e.texParameteri(n,e.TEXTURE_WRAP_T,L[r.wrapT]),(n===e.TEXTURE_3D||n===e.TEXTURE_2D_ARRAY)&&e.texParameteri(n,e.TEXTURE_WRAP_R,L[r.wrapR]),e.texParameteri(n,e.TEXTURE_MAG_FILTER,le[r.magFilter]),e.texParameteri(n,e.TEXTURE_MIN_FILTER,le[r.minFilter]),r.compareFunction&&(e.texParameteri(n,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(n,e.TEXTURE_COMPARE_FUNC,R[r.compareFunction])),t.has(`EXT_texture_filter_anisotropic`)===!0){if(r.magFilter===1003||r.minFilter!==1005&&r.minFilter!==1008||r.type===1015&&t.has(`OES_texture_float_linear`)===!1)return;if(r.anisotropy>1||i.get(r).__currentAnisotropy){let o=t.get(`EXT_texture_filter_anisotropic`);e.texParameterf(n,o.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(r.anisotropy,a.getMaxAnisotropy())),i.get(r).__currentAnisotropy=r.anisotropy}}}function z(t,n){let r=!1;t.__webglInit===void 0&&(t.__webglInit=!0,n.addEventListener(`dispose`,A));let i=n.source,a=_.get(i);a===void 0&&(a={},_.set(i,a));let o=ae(n);if(o!==t.__cacheKey){a[o]===void 0&&(a[o]={texture:e.createTexture(),usedTimes:0},s.memory.textures++,r=!0),a[o].usedTimes++;let i=a[t.__cacheKey];i!==void 0&&(a[t.__cacheKey].usedTimes--,i.usedTimes===0&&M(n)),t.__cacheKey=o,t.__webglTexture=a[o].texture}return r}function de(e,t,n){return Math.floor(Math.floor(e/n)/t)}function fe(t,n,i,a){let o=t.updateRanges;if(o.length===0)r.texSubImage2D(e.TEXTURE_2D,0,0,0,n.width,n.height,i,a,n.data);else{o.sort((e,t)=>e.start-t.start);let s=0;for(let e=1;e<o.length;e++){let t=o[s],r=o[e],i=t.start+t.count,a=de(r.start,n.width,4),c=de(t.start,n.width,4);r.start<=i+1&&a===c&&de(r.start+r.count-1,n.width,4)===a?t.count=Math.max(t.count,r.start+r.count-t.start):(++s,o[s]=r)}o.length=s+1;let c=r.getParameter(e.UNPACK_ROW_LENGTH),l=r.getParameter(e.UNPACK_SKIP_PIXELS),u=r.getParameter(e.UNPACK_SKIP_ROWS);r.pixelStorei(e.UNPACK_ROW_LENGTH,n.width);for(let t=0,s=o.length;t<s;t++){let s=o[t],c=Math.floor(s.start/4),l=Math.ceil(s.count/4),u=c%n.width,d=Math.floor(c/n.width),f=l;r.pixelStorei(e.UNPACK_SKIP_PIXELS,u),r.pixelStorei(e.UNPACK_SKIP_ROWS,d),r.texSubImage2D(e.TEXTURE_2D,0,u,d,f,1,i,a,n.data)}t.clearUpdateRanges(),r.pixelStorei(e.UNPACK_ROW_LENGTH,c),r.pixelStorei(e.UNPACK_SKIP_PIXELS,l),r.pixelStorei(e.UNPACK_SKIP_ROWS,u)}}function me(t,n,s){let u=e.TEXTURE_2D;(n.isDataArrayTexture||n.isCompressedArrayTexture)&&(u=e.TEXTURE_2D_ARRAY),n.isData3DTexture&&(u=e.TEXTURE_3D);let d=z(t,n),f=n.source;r.bindTexture(u,t.__webglTexture,e.TEXTURE0+s);let p=i.get(f);if(f.version!==p.__version||d===!0){if(r.activeTexture(e.TEXTURE0+s),!(typeof ImageBitmap<`u`&&n.image instanceof ImageBitmap)){let t=V.getPrimaries(V.workingColorSpace),i=n.colorSpace===``?null:V.getPrimaries(n.colorSpace),a=n.colorSpace===``||t===i?e.NONE:e.BROWSER_DEFAULT_WEBGL;r.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),r.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),r.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,a)}r.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment);let t=S(n.image,!1,a.maxTextureSize);t=Ae(n,t);let i=o.convert(n.format,n.colorSpace),m=o.convert(n.type),g=E(n.internalFormat,i,m,n.normalized,n.colorSpace,n.isVideoTexture);ue(u,n);let _,v=n.mipmaps,y=n.isVideoTexture!==!0,x=p.__version===void 0||d===!0,T=f.dataReady,O=k(n,t);if(n.isDepthTexture)g=D(n.format===c,n.type),x&&(y?r.texStorage2D(e.TEXTURE_2D,1,g,t.width,t.height):r.texImage2D(e.TEXTURE_2D,0,g,t.width,t.height,0,i,m,null));else if(n.isDataTexture){if(v.length>0){y&&x&&r.texStorage2D(e.TEXTURE_2D,O,g,v[0].width,v[0].height);for(let t=0,n=v.length;t<n;t++)_=v[t],y?T&&r.texSubImage2D(e.TEXTURE_2D,t,0,0,_.width,_.height,i,m,_.data):r.texImage2D(e.TEXTURE_2D,t,g,_.width,_.height,0,i,m,_.data);n.generateMipmaps=!1}else y?(x&&r.texStorage2D(e.TEXTURE_2D,O,g,t.width,t.height),T&&fe(n,t,i,m)):r.texImage2D(e.TEXTURE_2D,0,g,t.width,t.height,0,i,m,t.data)}else if(n.isCompressedTexture){if(n.isCompressedArrayTexture){y&&x&&r.texStorage3D(e.TEXTURE_2D_ARRAY,O,g,v[0].width,v[0].height,t.depth);for(let a=0,o=v.length;a<o;a++)if(_=v[a],n.format!==1023){if(i!==null){if(y){if(T){if(n.layerUpdates.size>0){let t=l(_.width,_.height,n.format,n.type);for(let o of n.layerUpdates){let n=_.data.subarray(o*t/_.data.BYTES_PER_ELEMENT,(o+1)*t/_.data.BYTES_PER_ELEMENT);r.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,a,0,0,o,_.width,_.height,1,i,n)}}else r.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,a,0,0,0,_.width,_.height,t.depth,i,_.data)}}else r.compressedTexImage3D(e.TEXTURE_2D_ARRAY,a,g,_.width,_.height,t.depth,0,_.data,0,0)}else b(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else y?T&&r.texSubImage3D(e.TEXTURE_2D_ARRAY,a,0,0,0,_.width,_.height,t.depth,i,m,_.data):r.texImage3D(e.TEXTURE_2D_ARRAY,a,g,_.width,_.height,t.depth,0,i,m,_.data);n.layerUpdates.size>0&&n.clearLayerUpdates()}else{y&&x&&r.texStorage2D(e.TEXTURE_2D,O,g,v[0].width,v[0].height);for(let t=0,a=v.length;t<a;t++)_=v[t],n.format===1023?y?T&&r.texSubImage2D(e.TEXTURE_2D,t,0,0,_.width,_.height,i,m,_.data):r.texImage2D(e.TEXTURE_2D,t,g,_.width,_.height,0,i,m,_.data):i===null?b(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):y?T&&r.compressedTexSubImage2D(e.TEXTURE_2D,t,0,0,_.width,_.height,i,_.data):r.compressedTexImage2D(e.TEXTURE_2D,t,g,_.width,_.height,0,_.data)}}else if(n.isDataArrayTexture){if(y){if(x&&r.texStorage3D(e.TEXTURE_2D_ARRAY,O,g,t.width,t.height,t.depth),T){if(n.layerUpdates.size>0){let a=l(t.width,t.height,n.format,n.type);for(let o of n.layerUpdates){let n=t.data.subarray(o*a/t.data.BYTES_PER_ELEMENT,(o+1)*a/t.data.BYTES_PER_ELEMENT);r.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,o,t.width,t.height,1,i,m,n)}n.clearLayerUpdates()}else r.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,t.width,t.height,t.depth,i,m,t.data)}}else r.texImage3D(e.TEXTURE_2D_ARRAY,0,g,t.width,t.height,t.depth,0,i,m,t.data)}else if(n.isData3DTexture)y?(x&&r.texStorage3D(e.TEXTURE_3D,O,g,t.width,t.height,t.depth),T&&r.texSubImage3D(e.TEXTURE_3D,0,0,0,0,t.width,t.height,t.depth,i,m,t.data)):r.texImage3D(e.TEXTURE_3D,0,g,t.width,t.height,t.depth,0,i,m,t.data);else if(n.isFramebufferTexture){if(x){if(y)r.texStorage2D(e.TEXTURE_2D,O,g,t.width,t.height);else{let n=t.width,a=t.height;for(let t=0;t<O;t++)r.texImage2D(e.TEXTURE_2D,t,g,n,a,0,i,m,null),n>>=1,a>>=1}}}else if(n.isHTMLTexture){if(`texElementImage2D`in e){let r=e.canvas;if(r.hasAttribute(`layoutsubtree`)||r.setAttribute(`layoutsubtree`,`true`),t.parentNode!==r){r.appendChild(t),h.add(n),r.onpaint=e=>{let t=e.changedElements;for(let e of h)t.includes(e.image)&&(e.needsUpdate=!0)},r.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,t);else{let n=e.RGBA,r=e.RGBA,i=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,n,r,i,t)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(v.length>0){if(y&&x){let t=K(v[0]);r.texStorage2D(e.TEXTURE_2D,O,g,t.width,t.height)}for(let t=0,n=v.length;t<n;t++)_=v[t],y?T&&r.texSubImage2D(e.TEXTURE_2D,t,0,0,i,m,_):r.texImage2D(e.TEXTURE_2D,t,g,i,m,_);n.generateMipmaps=!1}else if(y){if(x){let n=K(t);r.texStorage2D(e.TEXTURE_2D,O,g,n.width,n.height)}T&&r.texSubImage2D(e.TEXTURE_2D,0,0,0,i,m,t)}else r.texImage2D(e.TEXTURE_2D,0,g,i,m,t);C(n)&&w(u),p.__version=f.version,n.onUpdate&&n.onUpdate(n)}t.__version=n.version}function he(t,n,s){if(n.image.length!==6)return;let c=z(t,n),l=n.source;r.bindTexture(e.TEXTURE_CUBE_MAP,t.__webglTexture,e.TEXTURE0+s);let u=i.get(l);if(l.version!==u.__version||c===!0){r.activeTexture(e.TEXTURE0+s);let t=V.getPrimaries(V.workingColorSpace),i=n.colorSpace===``?null:V.getPrimaries(n.colorSpace),d=n.colorSpace===``||t===i?e.NONE:e.BROWSER_DEFAULT_WEBGL;r.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,n.flipY),r.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,n.premultiplyAlpha),r.pixelStorei(e.UNPACK_ALIGNMENT,n.unpackAlignment),r.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,d);let f=n.isCompressedTexture||n.image[0].isCompressedTexture,p=n.image[0]&&n.image[0].isDataTexture,m=[];for(let e=0;e<6;e++)!f&&!p?m[e]=S(n.image[e],!0,a.maxCubemapSize):m[e]=p?n.image[e].image:n.image[e],m[e]=Ae(n,m[e]);let h=m[0],g=o.convert(n.format,n.colorSpace),_=o.convert(n.type),v=E(n.internalFormat,g,_,n.normalized,n.colorSpace),y=n.isVideoTexture!==!0,x=u.__version===void 0||c===!0,T=l.dataReady,D=k(n,h);ue(e.TEXTURE_CUBE_MAP,n);let O;if(f){y&&x&&r.texStorage2D(e.TEXTURE_CUBE_MAP,D,v,h.width,h.height);for(let t=0;t<6;t++){O=m[t].mipmaps;for(let i=0;i<O.length;i++){let a=O[i];n.format===1023?y?T&&r.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,i,0,0,a.width,a.height,g,_,a.data):r.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,i,v,a.width,a.height,0,g,_,a.data):g===null?b(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):y?T&&r.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,i,0,0,a.width,a.height,g,a.data):r.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,i,v,a.width,a.height,0,a.data)}}}else{if(O=n.mipmaps,y&&x){O.length>0&&D++;let t=K(m[0]);r.texStorage2D(e.TEXTURE_CUBE_MAP,D,v,t.width,t.height)}for(let t=0;t<6;t++)if(p){y?T&&r.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,m[t].width,m[t].height,g,_,m[t].data):r.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,m[t].width,m[t].height,0,g,_,m[t].data);for(let n=0;n<O.length;n++){let i=O[n].image[t].image;y?T&&r.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,0,0,i.width,i.height,g,_,i.data):r.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,v,i.width,i.height,0,g,_,i.data)}}else{y?T&&r.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,0,0,g,_,m[t]):r.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,0,v,g,_,m[t]);for(let n=0;n<O.length;n++){let i=O[n];y?T&&r.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,0,0,g,_,i.image[t]):r.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+t,n+1,v,g,_,i.image[t])}}}C(n)&&w(e.TEXTURE_CUBE_MAP),u.__version=l.version,n.onUpdate&&n.onUpdate(n)}t.__version=n.version}function ge(t,n,a,s,c,l){let d=o.convert(a.format,a.colorSpace),f=o.convert(a.type),p=E(a.internalFormat,d,f,a.normalized,a.colorSpace),m=i.get(n),h=i.get(a);if(h.__renderTarget=n,!m.__hasExternalTextures){let t=Math.max(1,n.width>>l),i=Math.max(1,n.height>>l);c===e.TEXTURE_3D||c===e.TEXTURE_2D_ARRAY?r.texImage3D(c,l,p,t,i,n.depth,0,d,f,null):r.texImage2D(c,l,p,t,i,0,d,f,null)}r.bindFramebuffer(e.FRAMEBUFFER,t),Oe(n)?u.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,s,c,h.__webglTexture,0,G(n)):(c===e.TEXTURE_2D||c>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&c<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,s,c,h.__webglTexture,l),r.bindFramebuffer(e.FRAMEBUFFER,null)}function U(t,n,r){if(e.bindRenderbuffer(e.RENDERBUFFER,t),n.depthBuffer){let i=n.depthTexture,a=i&&i.isDepthTexture?i.type:null,o=D(n.stencilBuffer,a),s=n.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;Oe(n)?u.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,G(n),o,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,G(n),o,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,o,n.width,n.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,s,e.RENDERBUFFER,t)}else{let t=n.textures;for(let i=0;i<t.length;i++){let a=t[i],s=o.convert(a.format,a.colorSpace),c=o.convert(a.type),l=E(a.internalFormat,s,c,a.normalized,a.colorSpace);Oe(n)?u.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,G(n),l,n.width,n.height):r?e.renderbufferStorageMultisample(e.RENDERBUFFER,G(n),l,n.width,n.height):e.renderbufferStorage(e.RENDERBUFFER,l,n.width,n.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function _e(t,n,a){let s=n.isWebGLCubeRenderTarget===!0;if(r.bindFramebuffer(e.FRAMEBUFFER,t),!(n.depthTexture&&n.depthTexture.isDepthTexture))throw Error(`THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.`);let c=i.get(n.depthTexture);if(c.__renderTarget=n,(!c.__webglTexture||n.depthTexture.image.width!==n.width||n.depthTexture.image.height!==n.height)&&(n.depthTexture.image.width=n.width,n.depthTexture.image.height=n.height,n.depthTexture.needsUpdate=!0),s){if(c.__webglInit===void 0&&(c.__webglInit=!0,n.depthTexture.addEventListener(`dispose`,A)),c.__webglTexture===void 0){c.__webglTexture=e.createTexture(),r.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),ue(e.TEXTURE_CUBE_MAP,n.depthTexture);let t=o.convert(n.depthTexture.format),i=o.convert(n.depthTexture.type),a;n.depthTexture.format===1026?a=e.DEPTH_COMPONENT24:n.depthTexture.format===1027&&(a=e.DEPTH24_STENCIL8);for(let r=0;r<6;r++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+r,0,a,n.width,n.height,0,t,i,null)}}else oe(n.depthTexture,0);let l=c.__webglTexture,d=G(n),f=s?e.TEXTURE_CUBE_MAP_POSITIVE_X+a:e.TEXTURE_2D,p=n.depthTexture.format===1027?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(n.depthTexture.format===1026)Oe(n)?u.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,l,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,l,0);else if(n.depthTexture.format===1027)Oe(n)?u.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,p,f,l,0,d):e.framebufferTexture2D(e.FRAMEBUFFER,p,f,l,0);else throw Error(`THREE.WebGLTextures: Unknown depthTexture format.`)}function ve(t){let n=i.get(t),a=t.isWebGLCubeRenderTarget===!0;if(n.__boundDepthTexture!==t.depthTexture){let e=t.depthTexture;if(n.__depthDisposeCallback&&n.__depthDisposeCallback(),e){let t=()=>{delete n.__boundDepthTexture,delete n.__depthDisposeCallback,e.removeEventListener(`dispose`,t)};e.addEventListener(`dispose`,t),n.__depthDisposeCallback=t}n.__boundDepthTexture=e}if(t.depthTexture&&!n.__autoAllocateDepthBuffer){if(a)for(let e=0;e<6;e++)_e(n.__webglFramebuffer[e],t,e);else{let e=t.texture.mipmaps;e&&e.length>0?_e(n.__webglFramebuffer[0],t,0):_e(n.__webglFramebuffer,t,0)}}else if(a){n.__webglDepthbuffer=[];for(let i=0;i<6;i++)if(r.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[i]),n.__webglDepthbuffer[i]===void 0)n.__webglDepthbuffer[i]=e.createRenderbuffer(),U(n.__webglDepthbuffer[i],t,!1);else{let r=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,a=n.__webglDepthbuffer[i];e.bindRenderbuffer(e.RENDERBUFFER,a),e.framebufferRenderbuffer(e.FRAMEBUFFER,r,e.RENDERBUFFER,a)}}else{let i=t.texture.mipmaps;if(i&&i.length>0?r.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer[0]):r.bindFramebuffer(e.FRAMEBUFFER,n.__webglFramebuffer),n.__webglDepthbuffer===void 0)n.__webglDepthbuffer=e.createRenderbuffer(),U(n.__webglDepthbuffer,t,!1);else{let r=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,i=n.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,i),e.framebufferRenderbuffer(e.FRAMEBUFFER,r,e.RENDERBUFFER,i)}}r.bindFramebuffer(e.FRAMEBUFFER,null)}function W(t,n,r){let a=i.get(t);n!==void 0&&ge(a.__webglFramebuffer,t,t.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),r!==void 0&&ve(t)}function ye(t){let n=t.texture,a=i.get(t),c=i.get(n);t.addEventListener(`dispose`,ee);let l=t.textures,u=t.isWebGLCubeRenderTarget===!0,d=l.length>1;if(d||(c.__webglTexture===void 0&&(c.__webglTexture=e.createTexture()),c.__version=n.version,s.memory.textures++),u){a.__webglFramebuffer=[];for(let t=0;t<6;t++)if(n.mipmaps&&n.mipmaps.length>0){a.__webglFramebuffer[t]=[];for(let r=0;r<n.mipmaps.length;r++)a.__webglFramebuffer[t][r]=e.createFramebuffer()}else a.__webglFramebuffer[t]=e.createFramebuffer()}else{if(n.mipmaps&&n.mipmaps.length>0){a.__webglFramebuffer=[];for(let t=0;t<n.mipmaps.length;t++)a.__webglFramebuffer[t]=e.createFramebuffer()}else a.__webglFramebuffer=e.createFramebuffer();if(d)for(let t=0,n=l.length;t<n;t++){let n=i.get(l[t]);n.__webglTexture===void 0&&(n.__webglTexture=e.createTexture(),s.memory.textures++)}if(t.samples>0&&Oe(t)===!1){a.__webglMultisampledFramebuffer=e.createFramebuffer(),a.__webglColorRenderbuffer=[],r.bindFramebuffer(e.FRAMEBUFFER,a.__webglMultisampledFramebuffer);for(let n=0;n<l.length;n++){let r=l[n];a.__webglColorRenderbuffer[n]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,a.__webglColorRenderbuffer[n]);let i=o.convert(r.format,r.colorSpace),s=o.convert(r.type),c=E(r.internalFormat,i,s,r.normalized,r.colorSpace,t.isXRRenderTarget===!0),u=G(t);e.renderbufferStorageMultisample(e.RENDERBUFFER,u,c,t.width,t.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+n,e.RENDERBUFFER,a.__webglColorRenderbuffer[n])}e.bindRenderbuffer(e.RENDERBUFFER,null),t.depthBuffer&&(a.__webglDepthRenderbuffer=e.createRenderbuffer(),U(a.__webglDepthRenderbuffer,t,!0)),r.bindFramebuffer(e.FRAMEBUFFER,null)}}if(u){r.bindTexture(e.TEXTURE_CUBE_MAP,c.__webglTexture),ue(e.TEXTURE_CUBE_MAP,n);for(let r=0;r<6;r++)if(n.mipmaps&&n.mipmaps.length>0)for(let i=0;i<n.mipmaps.length;i++)ge(a.__webglFramebuffer[r][i],t,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+r,i);else ge(a.__webglFramebuffer[r],t,n,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+r,0);C(n)&&w(e.TEXTURE_CUBE_MAP),r.unbindTexture()}else if(d){for(let n=0,o=l.length;n<o;n++){let o=l[n],s=i.get(o),c=e.TEXTURE_2D;(t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(c=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),r.bindTexture(c,s.__webglTexture),ue(c,o),ge(a.__webglFramebuffer,t,o,e.COLOR_ATTACHMENT0+n,c,0),C(o)&&w(c)}r.unbindTexture()}else{let i=e.TEXTURE_2D;if((t.isWebGL3DRenderTarget||t.isWebGLArrayRenderTarget)&&(i=t.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),r.bindTexture(i,c.__webglTexture),ue(i,n),n.mipmaps&&n.mipmaps.length>0)for(let r=0;r<n.mipmaps.length;r++)ge(a.__webglFramebuffer[r],t,n,e.COLOR_ATTACHMENT0,i,r);else ge(a.__webglFramebuffer,t,n,e.COLOR_ATTACHMENT0,i,0);C(n)&&w(i),r.unbindTexture()}t.depthBuffer&&ve(t)}function be(e){let t=e.textures;for(let n=0,a=t.length;n<a;n++){let a=t[n];if(C(a)){let t=T(e),n=i.get(a).__webglTexture;r.bindTexture(t,n),w(t),r.unbindTexture()}}}let xe=[],Ce=[];function we(t){if(t.samples>0){if(Oe(t)===!1){let n=t.textures,a=t.width,o=t.height,s=e.COLOR_BUFFER_BIT,c=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,l=i.get(t),u=n.length>1;if(u)for(let t=0;t<n.length;t++)r.bindFramebuffer(e.FRAMEBUFFER,l.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,null),r.bindFramebuffer(e.FRAMEBUFFER,l.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,null,0);r.bindFramebuffer(e.READ_FRAMEBUFFER,l.__webglMultisampledFramebuffer);let f=t.texture.mipmaps;f&&f.length>0?r.bindFramebuffer(e.DRAW_FRAMEBUFFER,l.__webglFramebuffer[0]):r.bindFramebuffer(e.DRAW_FRAMEBUFFER,l.__webglFramebuffer);for(let r=0;r<n.length;r++){if(t.resolveDepthBuffer&&(t.depthBuffer&&(s|=e.DEPTH_BUFFER_BIT),t.stencilBuffer&&t.resolveStencilBuffer&&(s|=e.STENCIL_BUFFER_BIT)),u){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,l.__webglColorRenderbuffer[r]);let t=i.get(n[r]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,t,0)}e.blitFramebuffer(0,0,a,o,0,0,a,o,s,e.NEAREST),d===!0&&(xe.length=0,Ce.length=0,xe.push(e.COLOR_ATTACHMENT0+r),t.depthBuffer&&t.storeMultisampledDepthBuffer===!1&&(xe.push(c),Ce.push(c),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,Ce)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,xe))}if(r.bindFramebuffer(e.READ_FRAMEBUFFER,null),r.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),u)for(let t=0;t<n.length;t++){r.bindFramebuffer(e.FRAMEBUFFER,l.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.RENDERBUFFER,l.__webglColorRenderbuffer[t]);let a=i.get(n[t]).__webglTexture;r.bindFramebuffer(e.FRAMEBUFFER,l.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+t,e.TEXTURE_2D,a,0)}r.bindFramebuffer(e.DRAW_FRAMEBUFFER,l.__webglMultisampledFramebuffer)}else if(t.depthBuffer&&t.storeMultisampledDepthBuffer===!1&&d){let n=t.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[n])}}}function G(e){return Math.min(a.maxSamples,e.samples)}function Oe(e){let n=i.get(e);return e.samples>0&&t.has(`WEBGL_multisampled_render_to_texture`)===!0&&n.__useRenderToTexture!==!1}function ke(e){let t=s.render.frame;m.get(e)!==t&&(m.set(e,t),e.update())}function Ae(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(V.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&b(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):f(`WebGLTextures: Unsupported texture color space:`,n)),t}function K(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(p.width=e.naturalWidth||e.width,p.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(p.width=e.displayWidth,p.height=e.displayHeight):(p.width=e.width,p.height=e.height),p}this.allocateTextureUnit=F,this.resetTextureUnits=ne,this.getTextureUnits=P,this.setTextureUnits=ie,this.setTexture2D=oe,this.setTexture2DArray=se,this.setTexture3D=ce,this.setTextureCube=I,this.rebindTextures=W,this.setupRenderTarget=ye,this.updateRenderTargetMipmap=be,this.updateMultisampleRenderTarget=we,this.setupDepthRenderbuffer=ve,this.setupFrameBufferTexture=ge,this.useMultisampledRTT=Oe,this.isReversedDepthBuffer=function(){return r.buffers.depth.getReversed()}}function $r(e,t){function n(n,r=``){let i,a=V.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var ei=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,ti=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,ni=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new S(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new P({vertexShader:ei,fragmentShader:ti,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new z(new qe(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},ri=class extends y{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,l=null,u=null,f=null,p=null,m=null,h=null,g=typeof XRWebGLBinding<`u`,_=new ni,y={},x=t.getContextAttributes(),C=null,w=null,E=[],D=[],O=new H,k=null,A=null,ee=new v;ee.viewport=new ze;let j=new v;j.viewport=new ze;let M=[ee,j],N=new W,ne=null,re=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=E[e];return t===void 0&&(t=new te,E[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=E[e];return t===void 0&&(t=new te,E[e]=t),t.getGripSpace()},this.getHand=function(e){let t=E[e];return t===void 0&&(t=new te,E[e]=t),t.getHandSpace()};function P(e){let t=D.indexOf(e.inputSource);if(t===-1)return;let n=E[t];n!==void 0&&(n.update(e.inputSource,e.frame,l||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function ie(){r.removeEventListener(`select`,P),r.removeEventListener(`selectstart`,P),r.removeEventListener(`selectend`,P),r.removeEventListener(`squeeze`,P),r.removeEventListener(`squeezestart`,P),r.removeEventListener(`squeezeend`,P),r.removeEventListener(`end`,ie),r.removeEventListener(`inputsourceschange`,F);for(let e=0;e<E.length;e++){let t=D[e];t!==null&&(D[e]=null,E[e].disconnect(t))}ne=null,re=null,_.reset();for(let e in y)delete y[e];if(e.setRenderTarget(C),m=null,p=null,f=null,r=null,w=null,z.stop(),n.isPresenting=!1,e.setPixelRatio(k),e.setSize(O.width,O.height,!1),A!==null){let e=A.camera;e.fov=A.fov,e.zoom=A.zoom,e.updateProjectionMatrix(),A=null}n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&b(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&b(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return l||a},this.setReferenceSpace=function(e){l=e},this.getBaseLayer=function(){return p===null?m:p},this.getBinding=function(){return f===null&&g&&(f=new XRWebGLBinding(r,t)),f},this.getFrame=function(){return h},this.getSession=function(){return r},this.setSession=async function(u){if(r=u,r!==null){if(C=e.getRenderTarget(),r.addEventListener(`select`,P),r.addEventListener(`selectstart`,P),r.addEventListener(`selectend`,P),r.addEventListener(`squeeze`,P),r.addEventListener(`squeezestart`,P),r.addEventListener(`squeezeend`,P),r.addEventListener(`end`,ie),r.addEventListener(`inputsourceschange`,F),x.xrCompatible!==!0&&await t.makeXRCompatible(),k=e.getPixelRatio(),e.getSize(O),g&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;x.depth&&(o=x.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=x.stencil?c:d,a=x.stencil?Ie:ge);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};f=this.getBinding(),p=f.createProjectionLayer(s),r.updateRenderState({layers:[p]}),e.setPixelRatio(1),e.setSize(p.textureWidth,p.textureHeight,!1),w=new Ue(p.textureWidth,p.textureHeight,{format:se,type:fe,depthTexture:new T(p.textureWidth,p.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:x.stencil,colorSpace:e.outputColorSpace,samples:x.antialias?4:0,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1,storeMultisampledDepthBuffer:p.ignoreDepthValues===!1,storeMultisampledStencilBuffer:p.ignoreDepthValues===!1})}else{let n={antialias:x.antialias,alpha:!0,depth:x.depth,stencil:x.stencil,framebufferScaleFactor:i};m=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:m}),e.setPixelRatio(1),e.setSize(m.framebufferWidth,m.framebufferHeight,!1),w=new Ue(m.framebufferWidth,m.framebufferHeight,{format:se,type:fe,colorSpace:e.outputColorSpace,stencilBuffer:x.stencil,resolveDepthBuffer:m.ignoreDepthValues===!1,resolveStencilBuffer:m.ignoreDepthValues===!1,storeMultisampledDepthBuffer:m.ignoreDepthValues===!1,storeMultisampledStencilBuffer:m.ignoreDepthValues===!1})}w.isXRRenderTarget=!0,this.setFoveation(s),l=null,a=await r.requestReferenceSpace(o),z.setContext(r),z.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function F(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=D.indexOf(n);r>=0&&(D[r]=null,E[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=D.indexOf(n);if(r===-1){for(let e=0;e<E.length;e++)if(e>=D.length){D.push(n),r=e;break}else if(D[e]===null){D[e]=n,r=e;break}if(r===-1)break}let i=E[r];i&&i.connect(n)}}let ae=new I,oe=new I;function ce(e,t,n){ae.setFromMatrixPosition(t.matrixWorld),oe.setFromMatrixPosition(n.matrixWorld);let r=ae.distanceTo(oe),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function L(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;_.texture!==null&&(_.depthNear>0&&(t=_.depthNear),_.depthFar>0&&(n=_.depthFar)),N.near=j.near=ee.near=t,N.far=j.far=ee.far=n,(ne!==N.near||re!==N.far)&&(r.updateRenderState({depthNear:N.near,depthFar:N.far}),ne=N.near,re=N.far),N.layers.mask=e.layers.mask|6,ee.layers.mask=N.layers.mask&-5,j.layers.mask=N.layers.mask&-3;let i=e.parent,a=N.cameras;L(N,i);for(let e=0;e<a.length;e++)L(a[e],i);a.length===2?ce(N,ee,j):N.projectionMatrix.copy(ee.projectionMatrix),A===null&&e.isPerspectiveCamera&&(A={camera:e,fov:e.fov,zoom:e.zoom}),le(e,N,i)};function le(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=Me*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(p!==null||m!==null)return s},this.setFoveation=function(e){s=e,p!==null&&(p.fixedFoveation=e),m!==null&&m.fixedFoveation!==void 0&&(m.fixedFoveation=e)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(N)},this.getCameraTexture=function(e){return y[e]};let R=null;function ue(t,i){if(u=i.getViewerPose(l||a),h=i,u!==null){let t=u.views;m!==null&&(e.setRenderTargetFramebuffer(w,m.framebuffer),e.setRenderTarget(w));let i=!1;t.length!==N.cameras.length&&(N.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(m!==null)a=m.getViewport(r);else{let t=f.getViewSubImage(p,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(w,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(w))}let o=M[n];o===void 0&&(o=new v,o.layers.enable(n),o.viewport=new ze,M[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(N.matrix.copy(o.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),i===!0&&N.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&g){f=n.getBinding();let e=f.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&_.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&g){e.state.unbindTexture(),f=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=y[n];e||(e=new S,y[n]=e);let t=f.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<E.length;e++){let t=D[e],n=E[e];t!==null&&n!==void 0&&n.update(t,i,l||a)}R&&R(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),h=null}let z=new Je;z.setAnimationLoop(ue),this.setAnimationLoop=function(e){R=e},this.dispose=function(){}}},ii=new Ke,ai=new X;ai.set(-1,0,0,0,1,0,0,0,1);function oi(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,D(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isNodeMaterial?t.uniformsNeedUpdate=!1:t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,e.envMapRotation.value.setFromMatrix4(ii.makeRotationFromEuler(o)).transpose(),a.isCubeTexture&&a.isRenderTargetTexture===!1&&e.envMapRotation.value.premultiply(ai),e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.retroreflectivity>0&&(e.retroreflectivity.value=t.retroreflectivity),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function si(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(_(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,y));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(p(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return f(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function p(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let e=0,t=r.length;e<t;e++){let t=r[e];if(Array.isArray(t))for(let n=0,r=t.length;n<r;n++)m(t[n],e,n,a);else m(t,e,0,a)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function m(t,n,r,i){if(g(t,n,r,i)===!0){let n=t.__offset,r=t.value;if(Array.isArray(r)){let e=0;for(let n=0;n<r.length;n++){let i=r[n],a=v(i);h(i,t.__data,e),typeof i!=`number`&&typeof i!=`boolean`&&!i.isMatrix3&&!ArrayBuffer.isView(i)&&(e+=a.storage/Float32Array.BYTES_PER_ELEMENT)}}else h(r,t.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,n,t.__data)}}function h(e,t,n){typeof e==`number`||typeof e==`boolean`?t[0]=e:e.isMatrix3?(t[0]=e.elements[0],t[1]=e.elements[1],t[2]=e.elements[2],t[3]=0,t[4]=e.elements[3],t[5]=e.elements[4],t[6]=e.elements[5],t[7]=0,t[8]=e.elements[6],t[9]=e.elements[7],t[10]=e.elements[8],t[11]=0):ArrayBuffer.isView(e)?t.set(new e.constructor(e.buffer,e.byteOffset,t.length)):e.toArray(t,n)}function g(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:ArrayBuffer.isView(i)?i.slice():i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(ArrayBuffer.isView(i))return!0;else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function _(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=v(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function v(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?b(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):ArrayBuffer.isView(e)?(t.boundary=16,t.storage=e.byteLength):b(`WebGLRenderer: Unsupported uniform value type.`,e),t}function y(t){let n=t.target;n.removeEventListener(`dispose`,y);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function x(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:x}}var ci=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),li=null;function ui(){return li===null&&(li=new ne(ci,16,16,E,ie),li.name=`DFG_LUT`,li.minFilter=q,li.magFilter=q,li.wrapS=De,li.wrapT=De,li.generateMipmaps=!1,li.needsUpdate=!0),li}var di=class{constructor(e={}){let{canvas:t=Ve(),context:n=null,depth:r=!0,stencil:a=!1,alpha:o=!1,antialias:s=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u=`default`,failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:p=!1,outputBufferType:m=fe}=e;this.isWebGLRenderer=!0;let h;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);h=n.getContextAttributes().alpha}else h=o;let g=m,_=new Set([ee,Ce,C]),v=new Set([fe,ge,_e,Ie,je,Oe]),y=new Uint32Array(4),x=new Int32Array(4),S=new I,w=null,T=null,E=[],D=[],O=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let k=this,A=!1,M=null,te=null,N=null,ne=null;this._outputColorSpace=i;let re=0,P=0,F=null,ae=-1,oe=null,se=new ze,ce=new ze,L=null,le=new U(0),R=0,z=t.width,de=t.height,B=1,me=null,he=null,H=new ze(0,0,z,de),ve=new ze(0,0,z,de),W=!1,ye=new j,be=!1,Se=!1,Te=new Ke,G=new I,Ee=new ze,De={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},ke=!1;function Ae(){return F===null?B:1}let K=n;function Me(e,n){return t.getContext(e,n)}let Ne,Pe,q,Fe,J,Y,Le,Re,X,Be,He,We,Ge,qe,Z,Q,Xe,Ze,Qe,$e,at,ot,st;try{let e={alpha:!0,depth:r,stencil:a,antialias:s,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:d};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r186`),t.addEventListener(`webglcontextlost`,ut,!1),t.addEventListener(`webglcontextrestored`,dt,!1),t.addEventListener(`webglcontextcreationerror`,ft,!1),K===null){let t=`webgl2`;if(K=Me(t,e),K===null)throw Me(t)?Error(`THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.`):Error(`THREE.WebGLRenderer: Error creating WebGL context.`)}ct()}catch(e){throw t.removeEventListener(`webglcontextlost`,ut,!1),t.removeEventListener(`webglcontextrestored`,dt,!1),t.removeEventListener(`webglcontextcreationerror`,ft,!1),f(`WebGLRenderer: `+e.message),e}function ct(){Ne=new Ot(K),Ne.init(),at=new $r(K,Ne),Pe=new rt(K,Ne,e,at),q=new Zr(K,Ne),Pe.reversedDepthBuffer&&p&&q.buffers.depth.setReversed(!0),te=K.createFramebuffer(),N=K.createFramebuffer(),ne=K.createFramebuffer(),Fe=new jt(K),J=new jr,Y=new Qr(K,Ne,q,J,Pe,at,Fe),Le=new Dt(k),Re=new Ye(K),ot=new tt(K,Re),X=new kt(K,Re,Fe,ot),Be=new Nt(K,X,Re,ot,Fe),Ze=new Mt(K,Pe,Y),Z=new it(J),He=new Ar(k,Le,Ne,Pe,ot,Z),We=new oi(k,J),Ge=new Fr,qe=new Hr(Ne),Xe=new et(k,Le,q,Be,h,c),Q=new Xr(k,Be,Pe),st=new si(K,Fe,Pe,q),Qe=new nt(K,Ne,Fe),$e=new At(K,Ne,Fe),Fe.programs=He.programs,k.capabilities=Pe,k.extensions=Ne,k.properties=J,k.renderLists=Ge,k.shadowMap=Q,k.state=q,k.info=Fe}g!==1009&&(O=new Ft(g,t.width,t.height,s,r,a));let lt=new ri(k,K);this.xr=lt,this.getContext=function(){return K},this.getContextAttributes=function(){return K.getContextAttributes()},this.forceContextLoss=function(){let e=Ne.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=Ne.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return B},this.setPixelRatio=function(e){e!==void 0&&(B=e,this.setSize(z,de,!1))},this.getSize=function(e){return e.set(z,de)},this.setSize=function(e,n,r=!0){lt.isPresenting?b(`WebGLRenderer: Can't change size while VR device is presenting.`):(z=e,de=n,t.width=Math.floor(e*B),t.height=Math.floor(n*B),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),O!==null&&O.setSize(t.width,t.height),this.setViewport(0,0,e,n))},this.getDrawingBufferSize=function(e){return e.set(z*B,de*B).floor()},this.setDrawingBufferSize=function(e,n,r){z=e,de=n,B=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(g===1009)f(`WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);else{if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){b(`WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}O.setEffects(e||[])}},this.getCurrentViewport=function(e){return e.copy(se)},this.getViewport=function(e){return e.copy(H)},this.setViewport=function(e,t,n,r){e.isVector4?H.set(e.x,e.y,e.z,e.w):H.set(e,t,n,r),q.viewport(se.copy(H).multiplyScalar(B).round())},this.getScissor=function(e){return e.copy(ve)},this.setScissor=function(e,t,n,r){e.isVector4?ve.set(e.x,e.y,e.z,e.w):ve.set(e,t,n,r),q.scissor(ce.copy(ve).multiplyScalar(B).round())},this.getScissorTest=function(){return W},this.setScissorTest=function(e){q.setScissorTest(W=e)},this.setOpaqueSort=function(e){me=e},this.setTransparentSort=function(e){he=e},this.getClearColor=function(e){return e.copy(Xe.getClearColor())},this.setClearColor=function(){Xe.setClearColor(...arguments)},this.getClearAlpha=function(){return Xe.getClearAlpha()},this.setClearAlpha=function(){Xe.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(F!==null){let t=F.texture.format;e=_.has(t)}if(e){let e=F.texture.type,t=v.has(e),n=Xe.getClearColor(),r=Xe.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(y[0]=i,y[1]=a,y[2]=o,y[3]=r,K.clearBufferuiv(K.COLOR,0,y)):(x[0]=i,x[1]=a,x[2]=o,x[3]=r,K.clearBufferiv(K.COLOR,0,x))}else r|=K.COLOR_BUFFER_BIT}t&&(r|=K.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),n&&(r|=K.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&K.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(e){e.setRenderer(this),M=e},this.dispose=function(){t.removeEventListener(`webglcontextlost`,ut,!1),t.removeEventListener(`webglcontextrestored`,dt,!1),t.removeEventListener(`webglcontextcreationerror`,ft,!1),Xe.dispose(),Ge.dispose(),qe.dispose(),J.dispose(),Le.dispose(),Be.dispose(),ot.dispose(),st.dispose(),He.dispose(),lt.dispose(),lt.removeEventListener(`sessionstart`,yt),lt.removeEventListener(`sessionend`,bt),xt.stop()};function ut(e){e.preventDefault(),we(`WebGLRenderer: Context Lost.`),A=!0}function dt(){we(`WebGLRenderer: Context Restored.`),A=!1;let e=Fe.autoReset,t=Q.enabled,n=Q.autoUpdate,r=Q.needsUpdate,i=Q.type;ct(),Fe.autoReset=e,Q.enabled=t,Q.autoUpdate=n,Q.needsUpdate=r,Q.type=i}function ft(e){f(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function pt(e){let t=e.target;t.removeEventListener(`dispose`,pt),mt(t)}function mt(e){ht(e),J.remove(e)}function ht(e){let t=J.get(e).programs;t!==void 0&&(t.forEach(function(e){He.releaseProgram(e)}),e.isShaderMaterial&&He.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=De);let o=i.isMesh&&i.matrixWorld.determinantAffine()<0,s=zt(e,t,n,r,i);q.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=X.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;ot.setup(i,r,s,n,c);let h,g=Qe;if(c!==null&&(h=Re.get(c),g=$e,g.setIndex(h)),i.isMesh)r.wireframe===!0?(q.setLineWidth(r.wireframeLinewidth*Ae()),g.setMode(K.LINES)):g.setMode(K.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),q.setLineWidth(e*Ae()),i.isLineSegments?g.setMode(K.LINES):i.isLineLoop?g.setMode(K.LINE_LOOP):g.setMode(K.LINE_STRIP)}else i.isPoints?g.setMode(K.POINTS):i.isSprite&&g.setMode(K.TRIANGLES);if(i.isBatchedMesh){if(Ne.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Re.get(c).bytesPerElement:1,o=J.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(K,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function gt(e,t,n,r){M!==null&&e.isNodeMaterial&&M.setObject(r,e),be===!0&&Z.setState(e,n,!1),e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,Pt(e,t,r),e.side=0,e.needsUpdate=!0,Pt(e,t,r),e.side=2):Pt(e,t,r)}this.compile=function(e,t,n=null){n===null&&(n=e),M!==null&&M.renderStart(e,t,n),T=qe.get(n),T.init(t),D.push(T),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(T.pushLight(e),e.castShadow&&T.pushShadow(e))}),T.setupLights(),M!==null&&M.updateLights(T.state.lightsArray),Se=this.localClippingEnabled,be=Z.init(this.clippingPlanes,Se),be===!0&&Z.setGlobalState(this.clippingPlanes,t),M!==null&&Q.render(T.state.shadowsArray,n,t);let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let i=e.material;if(i){if(Array.isArray(i))for(let a=0;a<i.length;a++){let o=i[a];gt(o,n,t,e),r.add(o)}else gt(i,n,t,e),r.add(i)}}),T=D.pop(),M!==null&&M.renderEnd(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){r.forEach(function(e){let t=J.get(e).currentProgram;(t===void 0||t.isReady())&&r.delete(e)}),r.size===0?t(e):setTimeout(n,10)}Ne.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let _t=null;function vt(e){_t&&_t(e)}function yt(){xt.stop()}function bt(){xt.start()}let xt=new Je;xt.setAnimationLoop(vt),typeof self<`u`&&xt.setContext(self),this.setAnimationLoop=function(e){_t=e,lt.setAnimationLoop(e),e===null?xt.stop():xt.start()},lt.addEventListener(`sessionstart`,yt),lt.addEventListener(`sessionend`,bt),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){f(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(A===!0)return;M!==null&&M.renderStart(e,t);let n=lt.enabled===!0&&lt.isPresenting===!0,r=O!==null&&(F===null||n)&&O.begin(k,F);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),lt.enabled===!0&&lt.isPresenting===!0&&(O===null||O.isCompositing()===!1)&&(lt.cameraAutoUpdate===!0&&lt.updateCamera(t),t=lt.getCamera()),e.isScene===!0&&e.onBeforeRender(k,e,t,F),T=qe.get(e,D.length),T.init(t),T.state.textureUnits=Y.getTextureUnits(),D.push(T),Te.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),ye.setFromProjectionMatrix(Te,ue,t.reversedDepth),Se=this.localClippingEnabled,be=Z.init(this.clippingPlanes,Se),w=Ge.get(e,E.length),w.init(),E.push(w),lt.enabled===!0&&lt.isPresenting===!0){let e=k.xr.getDepthSensingMesh();e!==null&&St(e,t,-1/0,k.sortObjects)}St(e,t,0,k.sortObjects),w.finish(),M!==null&&M.updateLights(T.state.lightsArray),k.sortObjects===!0&&w.sort(me,he),ke=lt.enabled===!1||lt.isPresenting===!1||lt.hasDepthSensing()===!1,ke&&Xe.addToRenderList(w,e),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),be===!0&&Z.beginShadows();let i=T.state.shadowsArray;if(Q.render(i,e,t),be===!0&&Z.endShadows(),(r&&O.hasRenderPass())===!1){let n=w.opaque,r=w.transmissive;if(T.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];wt(n,r,e,a)}ke&&Xe.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];Ct(w,e,n,n.viewport)}}else r.length>0&&wt(n,r,e,t),ke&&Xe.render(e),Ct(w,e,t)}F!==null&&P===0&&(Y.updateMultisampleRenderTarget(F),Y.updateRenderTargetMipmap(F)),r&&O.end(k),e.isScene===!0&&e.onAfterRender(k,e,t),ot.resetDefaultState(),ae=-1,oe=null,D.pop(),D.length>0?(T=D[D.length-1],Y.setTextureUnits(T.state.textureUnits),be===!0&&Z.setGlobalState(k.clippingPlanes,T.state.camera)):T=null,E.pop(),w=E.length>0?E[E.length-1]:null,M!==null&&M.renderEnd()};function St(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLightProbeGrid)T.pushLightProbeGrid(e);else if(e.isLight)T.pushLight(e),e.castShadow&&T.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||e.intersectsFrustum(ye)){r&&Ee.setFromMatrixPosition(e.matrixWorld).applyMatrix4(Te);let i=Be.update(e),a=e.material;a.visible&&w.push(e,i,a,n,Ee.z,null,t)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||e.intersectsFrustum(ye))){let i=Be.update(e),a=e.material;if(r&&(e.boundingSphere===void 0?(i.boundingSphere===null&&i.computeBoundingSphere(),Ee.copy(i.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),Ee.copy(e.boundingSphere.center)),Ee.applyMatrix4(e.matrixWorld).applyMatrix4(Te)),Array.isArray(a)){let r=i.groups;for(let o=0,s=r.length;o<s;o++){let s=r[o],c=a[s.materialIndex];c&&c.visible&&w.push(e,i,c,n,Ee.z,s,t)}}else a.visible&&w.push(e,i,a,n,Ee.z,null,t)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)St(i[e],t,n,r)}function Ct(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;T.setupLightsView(n),be===!0&&Z.setGlobalState(k.clippingPlanes,n),r&&q.viewport(se.copy(r)),i.length>0&&Tt(i,t,n),a.length>0&&Tt(a,t,n),o.length>0&&Tt(o,t,n),q.buffers.depth.setTest(!0),q.buffers.depth.setMask(!0),q.buffers.color.setMask(!0),q.setPolygonOffset(!1)}function wt(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(T.state.transmissionRenderTarget[r.id]===void 0){let e=Ne.has(`EXT_color_buffer_half_float`)||Ne.has(`EXT_color_buffer_float`);T.state.transmissionRenderTarget[r.id]=new Ue(1,1,{generateMipmaps:!0,type:e?ie:fe,minFilter:pe,samples:Math.max(4,Pe.samples),stencilBuffer:a,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:V.workingColorSpace})}let i=T.state.transmissionRenderTarget[r.id],o=r.viewport||se;i.setSize(o.z*k.transmissionResolutionScale,o.w*k.transmissionResolutionScale);let s=k.getRenderTarget(),c=k.getActiveCubeFace(),l=k.getActiveMipmapLevel();k.setRenderTarget(i),k.getClearColor(le),R=k.getClearAlpha(),R<1&&k.setClearColor(16777215,.5),k.clear(),ke&&Xe.render(n);let u=k.toneMapping;k.toneMapping=0;let d=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),T.setupLightsView(r),be===!0&&Z.setGlobalState(k.clippingPlanes,r),Tt(e,n,r),Y.updateMultisampleRenderTarget(i),Y.updateRenderTargetMipmap(i),Ne.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,Et(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(Y.updateMultisampleRenderTarget(i),Y.updateRenderTargetMipmap(i))}k.setRenderTarget(s,c,l),k.setClearColor(le,R),d!==void 0&&(r.viewport=d),k.toneMapping=u}function Tt(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&Et(o,t,n,s,l,c)}}function Et(e,t,n,r,i,a){M!==null&&i.isNodeMaterial&&M.setObject(e,i),e.onBeforeRender(k,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(k,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,k.renderBufferDirect(n,t,r,i,e,a),i.side=2):k.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(k,t,n,r,i,a)}function Pt(e,t,n){t.isScene!==!0&&(t=De);let r=J.get(e),i=T.state.lights,a=T.state.shadowsArray,o=i.state.version,s=He.getParameters(e,i.state,a,t,n,T.state.lightProbeGridArray),c=He.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=Le.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,pt),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return Lt(e,s),d}else s.uniforms=He.getUniforms(e),M!==null&&e.isNodeMaterial&&M.build(e,n,s),e.onBeforeCompile(s,k),d=He.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Z.uniform),Lt(e,s),r.needsLights=Vt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.sunLights.value=i.state.sun,f.sunLightShadows.value=i.state.sunShadow,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.sunShadowMatrix.value=i.state.sunShadowMatrix,f.sunShadowCascade.value=i.state.sunShadowCascade,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.lightProbeGrid=T.state.lightProbeGridArray.length>0,r.currentProgram=d,r.uniformsList=null,d}function It(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=Un.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function Lt(e,t){let n=J.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function Rt(e,t){if(e.length===0)return null;if(e.length===1)return e[0].texture===null?null:e[0];S.setFromMatrixPosition(t.matrixWorld);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n.texture!==null&&n.boundingBox.containsPoint(S))return n}return null}function zt(e,t,n,r,i){t.isScene!==!0&&(t=De),Y.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=F===null?k.outputColorSpace:F.isXRRenderTarget===!0?F.texture.colorSpace:V.workingColorSpace,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=Le.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(F===null||F.isXRRenderTarget===!0)&&(h=k.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=J.get(r),y=T.state.lights;if(be===!0&&(Se===!0||e!==oe)){let t=e===oe&&r.id===ae;Z.setState(r,e,t)}let b=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?b=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i._colorsTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i._colorsTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?b=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Z.numPlanes||v.numIntersection!==Z.numIntersection)?b=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h&&v.morphTargetsCount===_?!!v.lightProbeGrid!=T.state.lightProbeGridArray.length>0&&(b=!0):b=!0:b=!0:b=!0:(b=!0,v.__version=r.version);let x=v.currentProgram;b===!0&&(x=Pt(r,t,i),M&&r.isNodeMaterial&&M.onUpdateProgram(r,x,v));let S=!1,C=!1,w=!1,E=x.getUniforms(),D=v.uniforms;if(q.useProgram(x.program)&&(S=!0,C=!0,w=!0),r.id!==ae&&(ae=r.id,C=!0),v.needsLights){let e=Rt(T.state.lightProbeGridArray,i);v.lightProbeGrid!==e&&(v.lightProbeGrid=e,C=!0)}if(S||oe!==e){q.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),E.setValue(K,`projectionMatrix`,e.projectionMatrix),E.setValue(K,`viewMatrix`,e.matrixWorldInverse);let t=E.map.cameraPosition;t!==void 0&&t.setValue(K,G.setFromMatrixPosition(e.matrixWorld)),Pe.logarithmicDepthBuffer&&E.setValue(K,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&E.setValue(K,`isOrthographic`,e.isOrthographicCamera===!0),oe!==e&&(oe=e,C=!0,w=!0)}if(v.needsLights&&(y.state.sunShadowMap.length>0&&E.setValue(K,`sunShadowMap`,y.state.sunShadowMap,Y),y.state.directionalShadowMap.length>0&&E.setValue(K,`directionalShadowMap`,y.state.directionalShadowMap,Y),y.state.spotShadowMap.length>0&&E.setValue(K,`spotShadowMap`,y.state.spotShadowMap,Y),y.state.pointShadowMap.length>0&&E.setValue(K,`pointShadowMap`,y.state.pointShadowMap,Y)),i.isSkinnedMesh){E.setOptional(K,i,`bindMatrix`),E.setOptional(K,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),E.setValue(K,`boneTexture`,e.boneTexture,Y))}i.isBatchedMesh&&(E.setOptional(K,i,`batchingTexture`),E.setValue(K,`batchingTexture`,i._matricesTexture,Y),E.setOptional(K,i,`batchingIdTexture`),E.setValue(K,`batchingIdTexture`,i._indirectTexture,Y),E.setOptional(K,i,`batchingColorTexture`),i._colorsTexture!==null&&E.setValue(K,`batchingColorTexture`,i._colorsTexture,Y));let O=n.morphAttributes;if((O.position!==void 0||O.normal!==void 0||O.color!==void 0)&&Ze.update(i,n,x),(C||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,E.setValue(K,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(D.envMapIntensity.value=t.environmentIntensity),D.dfgLUT!==void 0&&(D.dfgLUT.value=ui()),C){if(E.setValue(K,`toneMappingExposure`,k.toneMappingExposure),v.needsLights&&Bt(D,w),a&&r.fog===!0&&We.refreshFogUniforms(D,a),We.refreshMaterialUniforms(D,r,B,de,T.state.transmissionRenderTarget[e.id]),v.needsLights&&v.lightProbeGrid){let e=v.lightProbeGrid;D.probesSH.value=e.texture,D.probesMin.value.copy(e.boundingBox.min),D.probesMax.value.copy(e.boundingBox.max),D.probesResolution.value.copy(e.resolution)}Un.upload(K,It(v),D,Y)}if(r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(Un.upload(K,It(v),D,Y),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&E.setValue(K,`center`,i.center),E.setValue(K,`modelViewMatrix`,i.modelViewMatrix),E.setValue(K,`normalMatrix`,i.normalMatrix),E.setValue(K,`modelMatrix`,i.matrixWorld),r.uniformsGroups!==void 0){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];st.update(n,x),st.bind(n,x)}}return x}function Bt(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.sunLights.needsUpdate=t,e.sunLightShadows.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function Vt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return re},this.getActiveMipmapLevel=function(){return P},this.getRenderTarget=function(){return F},this.setRenderTargetTextures=function(e,t,n){let r=J.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),J.get(e.texture).__webglTexture=t,J.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=J.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0},this.setRenderTarget=function(e,t=0,n=0){F=e,re=t,P=n;let r=null,i=!1,a=!1;if(e){let o=J.get(e);if(o.__useDefaultFramebuffer!==void 0){q.bindFramebuffer(K.FRAMEBUFFER,o.__webglFramebuffer),se.copy(e.viewport),ce.copy(e.scissor),L=e.scissorTest,q.viewport(se),q.scissor(ce),q.setScissorTest(L),ae=-1;return}if(o.__webglFramebuffer===void 0)Y.setupRenderTarget(e);else if(o.__hasExternalTextures)Y.rebindTextures(e,J.get(e.texture).__webglTexture,J.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&J.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.`);Y.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=J.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&Y.useMultisampledRTT(e)===!1?J.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,se.copy(e.viewport),ce.copy(e.scissor),L=e.scissorTest}else se.copy(H).multiplyScalar(B).floor(),ce.copy(ve).multiplyScalar(B).floor(),L=W;if(n!==0&&(r=te),q.bindFramebuffer(K.FRAMEBUFFER,r)&&q.drawBuffers(e,r),q.viewport(se),q.scissor(ce),q.setScissorTest(L),i){let r=J.get(e.texture);K.framebufferTexture2D(K.FRAMEBUFFER,K.COLOR_ATTACHMENT0,K.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=J.get(e.textures[t]);K.framebufferTextureLayer(K.FRAMEBUFFER,K.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=J.get(e.texture);K.framebufferTexture2D(K.FRAMEBUFFER,K.COLOR_ATTACHMENT0,K.TEXTURE_2D,t.__webglTexture,n)}ae=-1};function Ht(e){let t=J.get(e);return(t.__readFormat!==e.format||t.__readType!==e.type)&&(t.__readFormat=e.format,t.__readType=e.type,t.__formatReadable=Pe.textureFormatReadable(e.format),t.__typeReadable=Pe.textureTypeReadable(e.type)),t}this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){f(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=J.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){q.bindFramebuffer(K.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;e.textures.length>1&&K.readBuffer(K.COLOR_ATTACHMENT0+s);let u=Ht(o);if(u.__formatReadable===!1){f(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(u.__typeReadable===!1){f(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&K.readPixels(t,n,r,i,at.convert(c),at.convert(l),a)}finally{let e=F===null?null:J.get(F).__webglFramebuffer;q.bindFramebuffer(K.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=J.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){q.bindFramebuffer(K.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;e.textures.length>1&&K.readBuffer(K.COLOR_ATTACHMENT0+s);let d=Ht(o);if(d.__formatReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(d.__typeReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let f=K.createBuffer();K.bindBuffer(K.PIXEL_PACK_BUFFER,f),K.bufferData(K.PIXEL_PACK_BUFFER,a.byteLength,K.STREAM_READ),K.readPixels(t,n,r,i,at.convert(l),at.convert(u),0),K.bindBuffer(K.PIXEL_PACK_BUFFER,null);let p=F===null?null:J.get(F).__webglFramebuffer;q.bindFramebuffer(K.FRAMEBUFFER,p);let m=K.fenceSync(K.SYNC_GPU_COMMANDS_COMPLETE,0);return K.flush(),await xe(K,m,4),K.bindBuffer(K.PIXEL_PACK_BUFFER,f),K.getBufferSubData(K.PIXEL_PACK_BUFFER,0,a),K.bindBuffer(K.PIXEL_PACK_BUFFER,null),K.deleteBuffer(f),K.deleteSync(m),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;Y.setTexture2D(e,0),K.copyTexSubImage2D(K.TEXTURE_2D,n,0,0,o,s,i,a),q.unbindTexture()},this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=at.convert(t.format),_=at.convert(t.type),v;t.isData3DTexture?(Y.setTexture3D(t,0),v=K.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(Y.setTexture2DArray(t,0),v=K.TEXTURE_2D_ARRAY):(Y.setTexture2D(t,0),v=K.TEXTURE_2D),q.activeTexture(K.TEXTURE0),q.pixelStorei(K.UNPACK_FLIP_Y_WEBGL,t.flipY),q.pixelStorei(K.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),q.pixelStorei(K.UNPACK_ALIGNMENT,t.unpackAlignment);let y=q.getParameter(K.UNPACK_ROW_LENGTH),b=q.getParameter(K.UNPACK_IMAGE_HEIGHT),x=q.getParameter(K.UNPACK_SKIP_PIXELS),S=q.getParameter(K.UNPACK_SKIP_ROWS),C=q.getParameter(K.UNPACK_SKIP_IMAGES);q.pixelStorei(K.UNPACK_ROW_LENGTH,h.width),q.pixelStorei(K.UNPACK_IMAGE_HEIGHT,h.height),q.pixelStorei(K.UNPACK_SKIP_PIXELS,l),q.pixelStorei(K.UNPACK_SKIP_ROWS,u),q.pixelStorei(K.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=J.get(e),r=J.get(t),h=J.get(n.__renderTarget),g=J.get(r.__renderTarget);q.bindFramebuffer(K.READ_FRAMEBUFFER,h.__webglFramebuffer),q.bindFramebuffer(K.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(K.framebufferTextureLayer(K.READ_FRAMEBUFFER,K.COLOR_ATTACHMENT0,J.get(e).__webglTexture,i,d+n),K.framebufferTextureLayer(K.DRAW_FRAMEBUFFER,K.COLOR_ATTACHMENT0,J.get(t).__webglTexture,a,m+n)),K.blitFramebuffer(l,u,o,s,f,p,o,s,K.DEPTH_BUFFER_BIT,K.NEAREST);q.bindFramebuffer(K.READ_FRAMEBUFFER,null),q.bindFramebuffer(K.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||J.has(e)){let n=J.get(e),r=J.get(t);q.bindFramebuffer(K.READ_FRAMEBUFFER,N),q.bindFramebuffer(K.DRAW_FRAMEBUFFER,ne);for(let e=0;e<c;e++)w?K.framebufferTextureLayer(K.READ_FRAMEBUFFER,K.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):K.framebufferTexture2D(K.READ_FRAMEBUFFER,K.COLOR_ATTACHMENT0,K.TEXTURE_2D,n.__webglTexture,i),T?K.framebufferTextureLayer(K.DRAW_FRAMEBUFFER,K.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):K.framebufferTexture2D(K.DRAW_FRAMEBUFFER,K.COLOR_ATTACHMENT0,K.TEXTURE_2D,r.__webglTexture,a),i===0?T?K.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):K.copyTexSubImage2D(v,a,f,p,l,u,o,s):K.blitFramebuffer(l,u,o,s,f,p,o,s,K.COLOR_BUFFER_BIT,K.NEAREST);q.bindFramebuffer(K.READ_FRAMEBUFFER,null),q.bindFramebuffer(K.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?K.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?K.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):K.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?K.texSubImage2D(K.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?K.compressedTexSubImage2D(K.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):K.texSubImage2D(K.TEXTURE_2D,a,f,p,o,s,g,_,h);q.pixelStorei(K.UNPACK_ROW_LENGTH,y),q.pixelStorei(K.UNPACK_IMAGE_HEIGHT,b),q.pixelStorei(K.UNPACK_SKIP_PIXELS,x),q.pixelStorei(K.UNPACK_SKIP_ROWS,S),q.pixelStorei(K.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&K.generateMipmap(v),q.unbindTexture()},this.initRenderTarget=function(e){J.get(e).__webglFramebuffer===void 0&&Y.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?Y.setTextureCube(e,0):e.isData3DTexture?Y.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?Y.setTexture2DArray(e,0):Y.setTexture2D(e,0),q.unbindTexture()},this.resetState=function(){re=0,P=0,F=null,q.reset(),ot.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return ue}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=V._getDrawingBufferColorSpace(e),t.unpackColorSpace=V._getUnpackColorSpace()}};function fi(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new Y,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=pi(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=pi(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function pi(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new G(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function mi(e,t=1e-4){t=Math.max(t,2**-52);let n={},r=e.getIndex(),i=e.getAttribute(`position`),a=r?r.count:i.count,o=0,s=Object.keys(e.attributes),c={},l={},u=[],d=[`getX`,`getY`,`getZ`,`getW`],f=[`setX`,`setY`,`setZ`,`setW`];for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.attributes[n];c[n]=new r.constructor(new r.array.constructor(r.count*r.itemSize),r.itemSize,r.normalized);let i=e.morphAttributes[n];i&&(l[n]||(l[n]=[]),i.forEach((e,t)=>{let r=new e.array.constructor(e.count*e.itemSize);l[n][t]=new e.constructor(r,e.itemSize,e.normalized)}))}let p=t*.5,m=10**Math.log10(1/t),h=p*m;for(let t=0;t<a;t++){let i=r?r.getX(t):t,a=``;for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),o=r.itemSize;for(let e=0;e<o;e++)a+=`${Math.trunc(r[d[e]](i)*m+h)},`}if(a in n)u.push(n[a]);else{for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),a=e.morphAttributes[n],u=r.itemSize,p=c[n],m=l[n];for(let e=0;e<u;e++){let t=d[e],n=f[e];if(p[n](o,r[t](i)),a)for(let e=0,r=a.length;e<r;e++)m[e][n](o,a[e][t](i))}}n[a]=o,u.push(o),o++}}let g=e.clone();for(let t in e.attributes){let e=c[t];if(g.setAttribute(t,new e.constructor(e.array.slice(0,o*e.itemSize),e.itemSize,e.normalized)),t in l)for(let e=0;e<l[t].length;e++){let n=l[t][e];g.morphAttributes[t][e]=new n.constructor(n.array.slice(0,o*n.itemSize),n.itemSize,n.normalized)}}return g.setIndex(u),g}function hi(e,t){if(t===0)return console.warn(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.`),e;if(t===2||t===1){let n=e.getIndex();if(n===null){let t=[],r=e.getAttribute(`position`);if(r!==void 0){for(let e=0;e<r.count;e++)t.push(e);e.setIndex(t),n=e.getIndex()}else return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.`),e}let r=n.count-2,i=[];if(t===2)for(let e=1;e<=r;e++)i.push(n.getX(0)),i.push(n.getX(e)),i.push(n.getX(e+1));else for(let e=0;e<r;e++)e%2==0?(i.push(n.getX(e)),i.push(n.getX(e+1)),i.push(n.getX(e+2))):(i.push(n.getX(e+2)),i.push(n.getX(e+1)),i.push(n.getX(e)));return i.length/3!==r&&console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.`),e.setIndex(i),e.clearGroups(),e}return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:`,t),e}function gi(e,t,n,r=2){let i=e,a=new Float32Array(i.length),o=e=>Math.max(0,Math.min(t-1,e)),s=e=>Math.max(0,Math.min(n-1,e));for(let e=0;e<r;e++){for(let e=0;e<n;e++)for(let n=0;n<t;n++)a[e*t+n]=(i[e*t+o(n-1)]+2*i[e*t+n]+i[e*t+o(n+1)])/4;[i,a]=[a,i];for(let e=0;e<n;e++)for(let n=0;n<t;n++)a[e*t+n]=(i[s(e-1)*t+n]+2*i[e*t+n]+i[s(e+1)*t+n])/4;[i,a]=[a,i]}return i}var _i=({columns:e,rows:t,west:n,east:r,south:i,north:a})=>Number.isInteger(e)&&e>=2&&Number.isInteger(t)&&t>=2&&[n,r,i,a].every(Number.isFinite)&&r>n&&a>i,vi=(e,t,n,r,i)=>t+.5*i*(n-e+i*(2*e-5*t+4*n-r+i*(3*(t-n)+r-e)));function yi({columns:e,rows:t,west:n,east:r,south:i,north:a},o,s){let c=gi(o,e,t),l=(n,r)=>c[Math.max(0,Math.min(t-1,r))*e+Math.max(0,Math.min(e-1,n))];return(o,c)=>{let u=(c-n)/(r-n)*e-.5,d=(a-o)/(a-i)*t-.5;if(!s&&(u<0||d<0||u>e-1||d>t-1))return NaN;u=Math.max(0,Math.min(e-1,u)),d=Math.max(0,Math.min(t-1,d));let f=Math.min(Math.floor(u),e-2),p=Math.min(Math.floor(d),t-2),m=u-f,h=e=>vi(l(f-1,e),l(f,e),l(f+1,e),l(f+2,e),m);return vi(h(p-1),h(p),h(p+1),h(p+2),d-p)}}function bi(e){let{columns:t,rows:n,runs:r,width:i}=e;if(!_i(e)||!Array.isArray(r)||!(i>0))throw Error(`Invalid terrain detail raster`);let a=new Float32Array(t*n).fill(NaN);for(let[e,i,...o]of r){if(!Number.isInteger(e)||!Number.isInteger(i)||e<0||e>=n||i<0||i+o.length>t||!o.every(Number.isFinite))throw Error(`Invalid terrain detail raster`);a.set(o,e*t+i)}return yi(e,a,!1)}var xi=(e,t,n)=>{let r=Math.max(0,Math.min(1,(e-t)/(n-t)));return r*r*(3-2*r)};function Si(e){let{columns:t,rows:n,heights:r}=e;if(!_i(e)||r.length!==t*n||!r.every(Number.isFinite))throw Error(`Invalid terrain elevation raster`);let i=yi(e,Float32Array.from(r),!0);if(!e.detail)return i;let a=bi(e.detail),{width:o}=e.detail;return(e,t,n=0)=>{let r=i(e,t),s=1-xi(n,o*.75,o);if(s<=0)return r;let c=a(e,t);return Number.isFinite(c)?r+(c-r)*s:r}}function Ci(e,t){return 5*Math.sin(e/65)+4*Math.sin(t/75)+2*Math.cos((e+t)/90)}function wi(e){let t=Si(e);if(![e.originLat,e.originLon,e.metersPerLongitude,e.elevationOffset].every(Number.isFinite)||e.metersPerLongitude<=0)throw Error(`Invalid terrain elevation raster`);let n=6371008.8*Math.PI/180;return(r,i,a)=>{let o=e.originLon-r/e.metersPerLongitude,s=e.originLat+i/n;return t(s,o,a)-e.elevationOffset}}var Ti=new URL(`decker-road-a0b0ab82-73d4-4461-b606-c78628001ae1-MUDEH4ZU.json`,import.meta.url).href,Ei=new URL(`hwy-129-tail-of-the-dragon-1185-711-BchUgJln.json`,import.meta.url).href,Di=new URL(`hwy-193-chili-bar-710-1042-CZy-Ez6w.json`,import.meta.url).href,Oi=new URL(`hwy-226a-diamondback-1005-395-kW6mADZ4.json`,import.meta.url).href,ki=new URL(`malibu-canyon-road-3ae9d056-333e-46d4-80ee-931586dcc6d4-C5U9lNZo.json`,import.meta.url).href,Ai=new URL(`mulholland-drive-5f2b72f6-2a75-4b2f-8ed1-06f3215bdf95-hw1r1NEU.json`,import.meta.url).href,ji=new URL(`newtown-road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82-B__wNL21.json`,import.meta.url).href,Mi=new URL(`pocono-raceway-north-south-DaUiMh9z.json`,import.meta.url).href,Ni=new URL(`shenandoah-xcxqWW-Q.json`,import.meta.url).href,Pi=new URL(`sonoma-raceway-DCCfBHyj.json`,import.meta.url).href,Fi=new URL(`thunderhill-5-mile-xAC5UWmC.json`,import.meta.url).href,Ii=new URL(`thunderhill-east-DH3rBwAJ.json`,import.meta.url).href,Li=new URL(`wolf-pen-gap-9fdb0b20-df7c-4b55-9ead-4e414fe93bd1-BbcOgbSQ.json`,import.meta.url).href,Ri=new URL(`newtown-road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82-z25OK69N.json`,import.meta.url).href,zi={"road-a0b0ab82-73d4-4461-b606-c78628001ae1":Ti,"hwy-129-tail-of-the-dragon-1185-711":Ei,"hwy-193-chili-bar-710-1042":Di,"hwy-226a-diamondback-1005-395":Oi,"road-3ae9d056-333e-46d4-80ee-931586dcc6d4":ki,"road-5f2b72f6-2a75-4b2f-8ed1-06f3215bdf95":Ai,"road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82":ji,"pocono-raceway-north-south":Mi,shenandoah:Ni,"sonoma-raceway":Pi,"thunderhill-5-mile":Fi,"thunderhill-east":Ii,"road-9fdb0b20-df7c-4b55-9ead-4e414fe93bd1":Li},Bi={"road-a0b0ab82-73d4-4461-b606-c78628001ae1":4490683,"hwy-129-tail-of-the-dragon-1185-711":2412507,"hwy-193-chili-bar-710-1042":2468559,"hwy-226a-diamondback-1005-395":3639379,"road-3ae9d056-333e-46d4-80ee-931586dcc6d4":4695038,"road-5f2b72f6-2a75-4b2f-8ed1-06f3215bdf95":4264809,"road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82":3102286,"pocono-raceway-north-south":1839490,shenandoah:1096107,"sonoma-raceway":1358821,"thunderhill-5-mile":2691139,"thunderhill-east":1708873,"road-9fdb0b20-df7c-4b55-9ead-4e414fe93bd1":3862345},Vi={};Vi[`road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82`]={url:Ri,reverse:!1};var Hi=[{id:`road-a0b0ab82-73d4-4461-b606-c78628001ae1`,closed:!1,name:`Decker Road, Malibu`,width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[-1287.41,1883.41],[-1280.29,1879.75],[-1273.17,1876.09],[-1266.05,1872.42],[-1258.93,1868.76],[-1251.81,1865.1],[-1244.69,1861.44],[-1237.91,1857.2],[-1231.34,1852.62],[-1224.77,1848.05],[-1218.2,1843.47],[-1211.63,1838.89],[-1205.06,1834.31],[-1198.49,1829.73],[-1191.92,1825.16],[-1185.35,1820.58],[-1178.78,1816],[-1172.71,1810.81],[-1166.84,1805.36],[-1161.36,1799.57],[-1156.62,1793.11],[-1152.01,1786.6],[-1150.04,1778.84],[-1148.06,1771.08],[-1146.08,1763.32],[-1144.1,1755.56],[-1142.12,1747.8],[-1140.15,1740.04],[-1137.73,1732.42],[-1134.95,1724.91],[-1132.17,1717.4],[-1129.4,1709.89],[-1126.62,1702.38],[-1123.85,1694.86],[-1120.72,1687.5],[-1117.25,1680.29],[-1113.77,1673.07],[-1110.3,1665.86],[-1105.69,1659.35],[-1100.8,1653.01],[-1095.9,1646.67],[-1091.01,1640.33],[-1086.12,1633.99],[-1080.96,1627.88],[-1075.3,1622.22],[-1069.53,1616.7],[-1062.49,1612.89],[-1055.45,1609.08],[-1048.41,1605.26],[-1041.37,1601.45],[-1034.32,1597.64],[-1027.28,1593.82],[-1019.98,1590.72],[-1012.16,1588.98],[-1004.35,1587.24],[-996.53,1585.51],[-988.71,1583.77],[-980.89,1582.03],[-973.08,1580.29],[-965.49,1577.85],[-958.11,1574.74],[-950.73,1571.62],[-943.36,1568.5],[-935.98,1565.39],[-928.61,1562.27],[-921.23,1559.15],[-913.85,1556.04],[-906.48,1552.92],[-899.1,1549.81],[-893.64,1543.95],[-888.17,1538.1],[-883.78,1531.55],[-880.6,1524.2],[-877.43,1516.85],[-874.25,1509.5],[-871.08,1502.14],[-867.9,1494.79],[-863.77,1488.01],[-858.46,1482.24],[-850.86,1479.71],[-843.27,1477.18],[-835.67,1474.64],[-828.07,1472.11],[-820.48,1469.58],[-812.88,1467.05],[-805.28,1464.52],[-797.69,1461.99],[-790.09,1459.45],[-782.93,1456.08],[-776.45,1451.37],[-770.74,1445.81],[-765.33,1439.9],[-759.93,1433.99],[-754.53,1428.08],[-749.12,1422.17],[-743.72,1416.26],[-736.49,1413.11],[-728.94,1410.41],[-721.4,1407.72],[-713.86,1405.03],[-706.32,1402.34],[-699.09,1399.03],[-692.43,1394.59],[-685.76,1390.15],[-679.1,1385.7],[-672.44,1381.26],[-665.41,1377.52],[-657.95,1374.62],[-650.45,1372.04],[-642.6,1373.58],[-634.74,1375.12],[-626.88,1376.65],[-619.02,1378.19],[-611.16,1379.73],[-603.33,1380.27],[-595.56,1378.33],[-588.32,1375.45],[-583.15,1369.45],[-579.9,1362.13],[-578.84,1354.2],[-577.8,1346.26],[-576.13,1338.66],[-570.05,1333.45],[-562.47,1330.89],[-554.63,1331.5],[-547.03,1333.66],[-540.08,1337.63],[-533.12,1341.6],[-526.17,1345.58],[-519.22,1349.55],[-512.27,1353.52],[-505.31,1357.49],[-498,1360.33],[-490.03,1361.05],[-483.22,1356.87],[-479.21,1350.37],[-480.7,1342.5],[-482.19,1334.63],[-483.67,1326.76],[-485.16,1318.89],[-484.9,1311.12],[-482.54,1303.47],[-477.39,1297.6],[-471.2,1292.8],[-463.22,1292.13],[-455.35,1293.01],[-447.55,1294.8],[-439.74,1296.58],[-431.93,1298.37],[-424.1,1299.6],[-416.15,1298.6],[-408.21,1297.61],[-400.26,1296.62],[-392.32,1295.62],[-384.37,1294.63],[-376.43,1293.64],[-368.47,1293.01],[-360.48,1293.58],[-352.5,1294.15],[-344.51,1294.72],[-336.56,1294.06],[-328.62,1293.02],[-320.68,1291.98],[-313.24,1289.07],[-305.86,1285.96],[-299.18,1281.86],[-293.73,1275.99],[-288.29,1270.12],[-284.94,1262.85],[-281.58,1255.58],[-278.23,1248.31],[-274.87,1241.04],[-271.51,1233.77],[-268.16,1226.5],[-264.8,1219.23],[-263.42,1211.36],[-262.17,1203.45],[-262.55,1195.58],[-264.2,1187.75],[-266.28,1180.09],[-270.56,1173.32],[-274.84,1166.55],[-279.75,1160.31],[-285.64,1154.89],[-291.53,1149.46],[-297.43,1144.04],[-302.86,1138.27],[-306.44,1131.11],[-308.41,1123.5],[-309.02,1115.52],[-305.86,1108.23],[-302.43,1101],[-297.81,1094.85],[-290.9,1090.82],[-283.45,1088.07],[-275.7,1086.09],[-267.94,1084.11],[-260.18,1082.12],[-252.42,1080.14],[-244.66,1078.16],[-237.53,1074.72],[-230.76,1070.44],[-223.99,1066.17],[-216.36,1063.91],[-208.59,1061.97],[-200.75,1060.75],[-192.75,1061.09],[-184.75,1061.42],[-176.86,1062.43],[-169.17,1064.67],[-161.48,1066.92],[-153.72,1068.4],[-145.73,1067.83],[-137.96,1066.19],[-130.37,1063.63],[-122.78,1061.07],[-115.19,1058.51],[-107.61,1055.95],[-100.02,1053.39],[-92.43,1050.83],[-84.84,1048.27],[-77.26,1045.71],[-69.67,1043.16],[-62.08,1040.6],[-54.92,1037.08],[-47.91,1033.21],[-40.9,1029.34],[-33.89,1025.47],[-26.88,1021.59],[-20.77,1016.72],[-16.21,1010.14],[-13.73,1002.97],[-14.15,994.97],[-14.8,987.04],[-18.58,979.99],[-22.37,972.93],[-26.15,965.87],[-29.94,958.82],[-33.73,951.76],[-38.06,945.1],[-43.53,939.25],[-49,933.41],[-54.47,927.56],[-59.94,921.71],[-65.21,915.73],[-68.26,908.33],[-71.3,900.92],[-69.21,893.59],[-64.06,887.78],[-56.11,886.99],[-48.13,886.27],[-40.16,885.54],[-32.18,884.82],[-24.21,884.09],[-16.74,881.7],[-9.73,877.85],[-2.71,873.99],[3.84,869.41],[10.2,864.55],[16.38,859.53],[20.24,852.51],[24.11,845.5],[27.97,838.49],[31.84,831.48],[35.7,824.46],[39.57,817.45],[42.98,810.28],[44.16,802.36],[45.34,794.44],[46.52,786.52],[47.7,778.6],[48.88,770.68],[51.19,763.25],[56.11,756.93],[62.83,752.69],[69.77,748.68],[76.71,744.68],[83.26,740.24],[88.17,733.92],[90.47,726.4],[92.04,718.55],[93.61,710.69],[95.18,702.84],[96.75,694.99],[98.6,687.24],[102.49,680.24],[106.38,673.24],[110.26,666.24],[114.15,659.24],[118.04,652.24],[121.93,645.24],[121.97,637.53],[120.84,629.61],[119.71,621.68],[118.57,613.75],[117.44,605.82],[118.97,598.39],[123.53,591.98],[129.98,587.24],[136.44,582.51],[142.9,577.77],[149.36,573.04],[154.28,566.89],[158.43,560.05],[162.59,553.2],[166.74,546.36],[169.28,538.89],[170.85,531.03],[172.42,523.18],[174,515.33],[175.57,507.48],[177.14,499.63],[178.71,491.77],[180.28,483.92],[181.85,476.07],[183.42,468.22],[184.99,460.37],[186.56,452.51],[189.18,444.99],[192.31,437.62],[195.45,430.25],[198.59,422.89],[201.73,415.52],[204.87,408.15],[208,400.79],[210.86,393.31],[213.34,385.7],[215.81,378.08],[218.29,370.47],[220.76,362.85],[223.67,355.44],[228,348.71],[232.65,342.25],[238.76,337.08],[244.74,331.79],[249.11,325.08],[253.49,318.37],[257.86,311.67],[260.15,304.14],[261.5,296.25],[262.85,288.36],[264.2,280.46],[265.55,272.57],[266.25,264.62],[266.42,256.61],[266.6,248.6],[266.78,240.6],[266.96,232.59],[267.13,224.59],[268.22,216.65],[269.3,208.72],[270.56,200.82],[272.35,193.01],[274.14,185.21],[275.93,177.4],[277.72,169.6],[279.5,161.79],[280.78,153.96],[279.75,146.02],[278.71,138.08],[277.68,130.14],[276.64,122.2],[275.61,114.26],[274.57,106.32],[273.54,98.38],[272.5,90.44],[272.55,82.49],[273.34,74.52],[274.23,66.57],[275.84,58.72],[277.45,50.88],[279.06,43.03],[280.67,35.19],[282.28,27.35],[283.89,19.5],[285.49,11.66],[287.1,3.81],[288.71,-4.03],[290.32,-11.88],[291.93,-19.72],[293.54,-27.56],[295.15,-35.41],[296.76,-43.25],[298.1,-51.14],[299,-59.09],[299.9,-67.05],[300.8,-75.01],[301.7,-82.96],[302.6,-90.92],[303.49,-98.88],[304.39,-106.84],[304.69,-114.83],[304.69,-122.83],[304.69,-130.84],[304.69,-138.85],[304.09,-146.82],[303.25,-154.79],[302.41,-162.75],[301.57,-170.71],[300.74,-178.68],[299.9,-186.64],[299.06,-194.6],[301.12,-202.02],[304.79,-209.14],[308.46,-216.26],[312.12,-223.38],[315.68,-230.54],[317.63,-238.31],[319.57,-246.07],[321.51,-253.84],[323.45,-261.61],[325.39,-269.38],[327.34,-277.15],[329.28,-284.92],[329.72,-292.72],[324.16,-297.97],[317.26,-300.6],[309.53,-298.49],[302.78,-294.27],[296.16,-289.76],[289.54,-285.26],[282.72,-281.64],[274.81,-282.85],[269.36,-287.31],[267.93,-294.71],[270.65,-302.22],[274.5,-309.25],[278.35,-316.27],[282.2,-323.29],[286.05,-330.31],[289.29,-337.62],[292.36,-345.02],[295.42,-352.42],[298.48,-359.82],[301.55,-367.21],[304.61,-374.61],[307.68,-382.01],[310.74,-389.41],[313.81,-396.81],[315.83,-404.45],[316.44,-412.44],[315.08,-420.27],[312.83,-427.88],[308.39,-434.54],[303.94,-441.21],[298.69,-447.15],[292.62,-452.37],[286.54,-457.59],[280.47,-462.81],[274.4,-468.03],[268.33,-473.25],[262.26,-478.47],[256.19,-483.7],[249.45,-487.48],[241.55,-488.73],[233.64,-489.98],[225.73,-491.23],[217.82,-492.48],[210.59,-495.56],[204.86,-500.89],[202.89,-508.3],[204.15,-516.13],[208.29,-522.81],[213.39,-528.99],[218.48,-535.17],[223.58,-541.35],[228.67,-547.52],[233.76,-553.7],[238.86,-559.88],[243.95,-566.06],[249.05,-572.24],[255.48,-576.53],[262.99,-579.3],[270.51,-582.07],[278.02,-584.83],[285.53,-587.6],[293.05,-590.37],[300.56,-593.14],[308.09,-595.83],[315.99,-597.14],[323.89,-598.46],[331.79,-599.78],[339.69,-601.09],[347.33,-603.32],[354.77,-606.3],[362.2,-609.27],[368.58,-614.05],[374.34,-619.52],[379.01,-626.03],[383.69,-632.53],[388.36,-639.03],[393.03,-645.53],[398.06,-651.75],[403.52,-657.6],[408.99,-663.45],[414.45,-669.31],[419.91,-675.16],[423.72,-681.81],[424.86,-689.73],[424.36,-697.63],[422.15,-705.2],[417.71,-711.86],[410.99,-716.1],[404.07,-720.14],[397.16,-724.17],[390.86,-729.01],[385.2,-734.67],[379.53,-740.33],[374.67,-746.55],[371.28,-753.81],[368.64,-761.28],[367.69,-769.23],[366.73,-777.18],[365.22,-784.95],[361.45,-792.02],[357.69,-799.08],[353.92,-806.15],[350.16,-813.21],[352.72,-820.67],[357.52,-826.88],[364.46,-830.89],[371.4,-834.89],[378.33,-838.89],[384.12,-844.15],[387.34,-851.27],[388.73,-859.16],[391.18,-866.59],[396.83,-872.02],[403.84,-875.89],[410.85,-879.75],[417.86,-883.62],[424.87,-887.49],[431.88,-891.36],[439.03,-894.93],[446.57,-897.63],[454.11,-900.32],[461.65,-903.01],[468.23,-907.3],[473.12,-913.51],[476.98,-920.53],[480.83,-927.54],[484.69,-934.56],[487.82,-941.82],[488.93,-949.75],[490.03,-957.68],[491.14,-965.61],[492.24,-973.54],[492.65,-981.48],[491.71,-989.43],[490.24,-997.23],[486.95,-1004.53],[483.66,-1011.83],[480.37,-1019.14],[477.08,-1026.44],[472.43,-1032.62],[465.9,-1037.26],[459.38,-1041.9],[452.86,-1046.55],[446.33,-1051.19],[439.81,-1055.83],[433.29,-1060.48],[426.76,-1065.12],[420.23,-1069.75],[412.97,-1073.13],[405.72,-1076.52],[399.24,-1081.21],[392.78,-1085.95],[387.01,-1091.45],[381.56,-1097.32],[376.12,-1103.2],[370.67,-1109.07],[365.29,-1114.99],[361.26,-1121.9],[357.22,-1128.82],[353.19,-1135.74],[349.15,-1142.65],[345.12,-1149.57],[341.09,-1156.49],[337.05,-1163.4],[333.32,-1170.47],[330.21,-1177.85],[327.11,-1185.23],[324,-1192.61],[321.71,-1200.24],[320.21,-1208.11],[318.71,-1215.97],[317.2,-1223.84],[316.25,-1231.73],[317.04,-1239.69],[317.17,-1247.65],[316.21,-1255.6],[315.24,-1263.55],[311.37,-1270.42],[306.9,-1277.07],[302.44,-1283.71],[297.97,-1290.36],[294.09,-1297.33],[290.76,-1304.61],[287.44,-1311.9],[284.7,-1319.38],[282.87,-1327.18],[281.04,-1334.97],[279.21,-1342.77],[277.38,-1350.57],[275.55,-1358.36],[273.72,-1366.16],[271.78,-1373.92],[268.82,-1381.36],[265.87,-1388.8],[262.91,-1396.24],[259.96,-1403.69],[259.69,-1411.36],[261.78,-1418.75],[269.34,-1419.2],[275.74,-1414.4],[278.67,-1407],[281.43,-1399.49],[284.2,-1391.97],[286.96,-1384.46],[289.73,-1376.94],[292.49,-1369.43],[295.26,-1361.91],[299.31,-1355.01],[303.39,-1348.12],[307.47,-1341.23],[312.06,-1334.7],[317.24,-1328.59],[322.42,-1322.49],[327.59,-1316.38],[332.77,-1310.27],[339.44,-1306.15],[347.05,-1305],[352.49,-1309.72],[351.81,-1317.44],[347.1,-1323.8],[342.01,-1329.98],[336.91,-1336.16],[331.82,-1342.33],[327.53,-1348.97],[324.85,-1356.51],[322.18,-1364.06],[319.83,-1371.69],[318.85,-1379.63],[317.88,-1387.58],[316.9,-1395.53],[317.37,-1403.45],[318.63,-1411.36],[319.89,-1419.26],[321.16,-1427.17],[322.42,-1435.08],[326.93,-1441.66],[331.58,-1448.17],[336.23,-1454.69],[340.89,-1461.2],[345.54,-1467.72],[350.2,-1474.24],[354.85,-1480.75],[359.5,-1487.27],[359.1,-1495.25],[358.66,-1503.25],[356.51,-1510.9],[353.83,-1518.45],[351.16,-1525.99],[348.48,-1533.54],[345.81,-1541.09],[343.79,-1548.82],[342.22,-1556.67],[340.65,-1564.52],[339.08,-1572.37],[339.73,-1580.28],[340.89,-1588.21],[342.45,-1596.03],[345.14,-1603.57],[347.83,-1611.11],[350.53,-1618.65],[353.22,-1626.19],[353.95,-1634.05],[353.71,-1642.05],[351.27,-1649.41],[347.16,-1656.28],[343.05,-1663.15],[338.94,-1670.03],[334.83,-1676.9],[330.73,-1683.77],[326.62,-1690.65],[321.86,-1697.05],[316.66,-1703.14],[311.46,-1709.23],[306.26,-1715.32],[301.06,-1721.41],[295.86,-1727.5],[290.66,-1733.59],[285.46,-1739.68],[281.43,-1746.56],[277.7,-1753.65],[273.97,-1760.73],[270.23,-1767.81],[267.26,-1775.25],[264.32,-1782.69],[261.47,-1790.17],[259.44,-1797.92],[257.41,-1805.66],[255.37,-1813.41],[253.34,-1821.15],[251.31,-1828.9],[249.27,-1836.64],[248.31,-1844.57],[247.62,-1852.55],[246.93,-1860.53],[246.24,-1868.51],[245.56,-1876.48],[244.87,-1884.46],[244.18,-1892.44],[242.96,-1900.34],[241.39,-1908.19],[239.82,-1916.04],[237.42,-1923.62],[234.03,-1930.88],[230.65,-1938.14],[227.27,-1945.4],[223.88,-1952.65],[220.5,-1959.91],[217.12,-1967.17],[213.73,-1974.43],[210.35,-1981.69],[206.97,-1988.94],[203.45,-1996.13],[199.71,-2003.21],[195.97,-2010.29],[192.23,-2017.37],[188.48,-2024.45],[184.02,-2031.04],[178.81,-2037.12],[173.36,-2042.95],[167.05,-2047.88],[160.74,-2052.81],[153.93,-2056.98],[146.92,-2060.85],[139.9,-2064.71],[132.89,-2068.57],[125.88,-2072.43],[118.86,-2076.3],[111.6,-2079.6],[104.02,-2082.19],[96.44,-2084.77],[88.6,-2086.26],[80.68,-2087.4]],elevation:[460.61,460.41,460.22,460.05,459.88,459.72,459.56,459.37,459.15,458.89,458.59,458.27,457.94,457.6,457.27,456.95,456.63,456.33,456.03,455.74,455.46,455.19,454.93,454.68,454.45,454.22,454,453.78,453.56,453.34,453.1,452.85,452.59,452.3,451.99,451.66,451.32,450.98,450.65,450.33,450.04,449.77,449.52,449.31,449.12,448.96,448.82,448.7,448.61,448.52,448.46,448.41,448.38,448.35,448.32,448.28,448.22,448.14,448.03,447.9,447.74,447.56,447.36,447.16,446.94,446.72,446.49,446.26,446.01,445.75,445.48,445.19,444.88,444.56,444.23,443.9,443.57,443.26,442.95,442.64,442.33,442.01,441.67,441.29,440.88,440.43,439.95,439.45,438.95,438.47,438.03,437.64,437.32,437.08,436.91,436.82,436.81,436.87,437,437.19,437.43,437.71,438.04,438.39,438.76,439.13,439.49,439.83,440.13,440.39,440.6,440.76,440.87,440.94,440.97,440.98,440.95,440.89,440.79,440.67,440.51,440.35,440.18,440.03,439.89,439.77,439.68,439.6,439.52,439.44,439.35,439.23,439.1,438.94,438.76,438.57,438.36,438.16,437.94,437.71,437.47,437.2,436.9,436.56,436.19,435.79,435.37,434.95,434.53,434.12,433.74,433.36,432.99,432.62,432.25,431.86,431.45,431.01,430.55,430.08,429.59,429.09,428.6,428.13,427.67,427.24,426.84,426.47,426.13,425.82,425.54,425.26,424.99,424.72,424.45,424.16,423.86,423.53,423.17,422.79,422.38,421.95,421.53,421.11,420.7,420.32,419.95,419.6,419.26,418.92,418.58,418.23,417.87,417.5,417.12,416.72,416.31,415.9,415.48,415.06,414.65,414.24,413.85,413.46,413.08,412.71,412.35,411.98,411.61,411.23,410.84,410.44,410.05,409.66,409.29,408.95,408.62,408.32,408.03,407.76,407.5,407.24,406.99,406.75,406.51,406.26,406,405.73,405.45,405.16,404.86,404.56,404.26,403.96,403.66,403.36,403.04,402.69,402.33,401.94,401.53,401.1,400.66,400.21,399.75,399.29,398.83,398.36,397.9,397.44,396.99,396.54,396.11,395.69,395.27,394.87,394.48,394.09,393.71,393.32,392.93,392.53,392.13,391.71,391.27,390.82,390.36,389.9,389.44,388.99,388.56,388.14,387.74,387.35,386.96,386.56,386.15,385.72,385.26,384.75,384.21,383.62,383.01,382.38,381.74,381.11,380.49,379.89,379.31,378.74,378.18,377.63,377.09,376.56,376.05,375.56,375.1,374.68,374.3,373.97,373.67,373.4,373.16,372.94,372.72,372.5,372.26,372.01,371.74,371.45,371.14,370.81,370.46,370.09,369.71,369.32,368.91,368.5,368.09,367.66,367.23,366.78,366.31,365.82,365.32,364.82,364.32,363.83,363.36,362.91,362.46,362.03,361.6,361.16,360.71,360.26,359.78,359.28,358.75,358.2,357.62,357.02,356.41,355.8,355.21,354.62,354.05,353.5,352.96,352.43,351.88,351.32,350.74,350.15,349.54,348.92,348.31,347.71,347.14,346.59,346.05,345.54,345.03,344.53,344.02,343.49,342.96,342.4,341.83,341.23,340.61,339.98,339.34,338.68,338.03,337.37,336.73,336.1,335.48,334.89,334.32,333.76,333.24,332.73,332.25,331.78,331.34,330.91,330.48,330.04,329.59,329.12,328.64,328.14,327.62,327.11,326.59,326.07,325.56,325.04,324.52,323.99,323.45,322.9,322.36,321.81,321.26,320.71,320.17,319.62,319.08,318.53,317.97,317.4,316.82,316.23,315.63,315.03,314.44,313.84,313.27,312.71,312.18,311.68,311.2,310.75,310.32,309.91,309.5,309.09,308.67,308.23,307.76,307.28,306.79,306.29,305.79,305.31,304.84,304.38,303.92,303.48,303.03,302.6,302.17,301.75,301.36,300.98,300.62,300.27,299.94,299.62,299.31,299.01,298.73,298.46,298.21,297.97,297.75,297.53,297.32,297.12,296.93,296.75,296.57,296.38,296.18,295.96,295.72,295.45,295.14,294.81,294.46,294.07,293.68,293.26,292.84,292.4,291.97,291.53,291.1,290.67,290.24,289.8,289.36,288.92,288.47,288.01,287.54,287.08,286.61,286.13,285.66,285.19,284.72,284.26,283.8,283.34,282.89,282.44,281.98,281.53,281.08,280.63,280.18,279.74,279.3,278.87,278.45,278.04,277.64,277.25,276.86,276.49,276.13,275.78,275.44,275.11,274.79,274.47,274.16,273.85,273.54,273.24,272.94,272.65,272.35,272.06,271.77,271.47,271.18,270.88,270.57,270.25,269.93,269.61,269.29,268.98,268.67,268.39,268.12,267.87,267.64,267.42,267.22,267.03,266.84,266.66,266.48,266.3,266.11,265.92,265.72,265.51,265.29,265.07,264.85,264.63,264.42,264.21,264.01,263.82,263.64,263.47,263.31,263.16,263,262.85,262.71,262.56,262.43,262.31,262.2,262.12,262.05,261.99,261.94,261.89,261.83,261.75,261.66,261.55,261.42,261.28,261.12,260.95,260.77,260.57,260.37,260.15,259.93,259.7,259.46,259.21,258.95,258.69,258.42,258.16,257.91,257.66,257.43,257.22,257.02,256.84,256.66,256.49,256.34,256.19,256.05,255.92,255.8,255.71,255.63,255.58,255.55,255.55,255.59,255.64,255.73,255.83,255.94,256.06,256.19,256.32,256.44,256.56,256.66,256.74,256.81,256.85,256.88,256.9,256.92,256.95,256.99,257.05,257.13,257.21,257.31,257.41,257.51,257.59,257.67,257.73,257.76,257.76,257.72,257.62,257.48,257.28,257.04,256.77,256.48,256.17,255.86,255.55,255.23,254.9,254.56,254.19,253.79,253.37,252.94,252.52,252.12,251.76,251.44,251.16,250.92,250.71,250.52,250.33,250.14,249.93,249.71,249.48,249.24,248.99,248.75,248.5,248.24,247.98,247.71,247.43,247.14,246.85,246.55,246.24,245.93,245.61,245.28,244.95,244.61,244.26,243.91,243.55,243.19,242.82,242.46,242.1,241.74,241.38,241.02,240.65,240.29,239.92,239.55,239.18,238.8,238.43,238.07,237.71,237.36,237.01,236.68,236.36,236.05,235.75,235.46,235.19,234.93,234.69,234.46,234.26,234.09,233.93,233.8,233.68,233.57,233.46,233.33,233.17,232.98,232.76,232.5,232.2,231.88,231.53,231.17,230.79,230.39,229.98,229.54,229.09,228.62,228.14,227.65,227.17,226.7,226.24,225.79,225.36,224.93,224.53,224.13,223.75,223.36,222.97,222.56,222.13,221.67,221.19,220.7,220.2,219.71,219.24,218.78,218.34,217.91,217.5,217.09,216.69,216.3,215.9,215.52,215.14,214.77,214.44,214.13,213.84,213.54,213.22,212.84,212.4,211.91,211.39,210.86,210.36,209.88,209.43,208.97,208.5,207.98,207.41,206.8,206.16,205.52,204.89,204.3,203.74,203.22,202.73,202.27,201.84,201.44,201.05,200.68,200.32,199.98,199.65,199.33,199.01,198.69,198.38,198.06,197.73,197.39,197.04,196.67,196.3,195.92,195.53,195.13,194.72,194.32,193.91,193.51,193.12,192.75,192.42,192.12,191.85,191.62,191.4,191.17,190.91,190.6,190.23,189.81,189.34,188.86,188.38,187.9,187.45,187.01,186.58,186.17,185.78,185.38,184.99,184.61,184.22,183.85,183.48,183.12,182.76,182.4,182.03,181.67,181.3,180.94,180.59,180.24,179.91,179.58,179.25,178.92,178.59,178.25,177.9,177.54,177.17,176.79,176.4,175.99,175.56,175.11,174.64,174.14,173.62,173.07,172.51,171.93,171.34,170.75,170.16,169.59,169.02,168.46,167.92,167.38,166.86,166.34,165.83,165.32,164.82,164.33,163.84,163.37,162.9,162.44,161.98,161.53,161.06,160.59,160.11,159.61,159.11,158.58,158.05,157.5,156.93,156.34,155.74,155.12,154.49,153.84,153.19,152.54,151.89,151.25,150.61,149.97,149.34,148.71,148.09,147.45,146.82,146.18,145.53,144.88,144.23,143.57,142.92,142.27,141.61,140.96,140.3,139.65,138.99,138.33,137.67,137.02,136.37,135.72,135.08,134.44,133.81,133.2,132.59,132,131.43,130.86,130.31,129.76,129.22,128.68,128.14,127.59,127.05,126.5,125.94,125.39,124.84,124.29,123.75,123.22,122.71,122.2,121.7,121.22,120.75,120.29,119.84,119.4,118.97,118.55,118.14,117.73,117.34,116.95,116.57,116.2,115.84,115.49,115.15,114.83,114.52,114.24,113.98,113.74,113.52,113.33,113.14,112.98,112.82,112.67,112.54,112.41,112.29,112.17,112.05,111.93,111.8,111.66,111.5,111.31,111.08,110.8,110.48,110.11,109.68,109.22,108.73,108.23,107.73,107.23,106.76,106.3,105.85,105.41,104.98,104.53,104.07,103.61,103.13,102.65,102.17,101.68,101.2,100.72,100.25,99.78,99.31,98.85,98.39,97.94,97.48,97.03,96.58,96.14,95.69,95.24,94.8,94.35,93.91,93.46,93.01,92.56,92.09,91.61,91.12,90.61,90.1,89.58,89.06,88.53,88,87.47,86.92,86.35,85.76,85.14,84.49,83.83,83.15,82.46,81.78,81.11,80.45,79.81,79.18,78.56,77.94,77.33,76.7,76.07,75.43,74.77,74.1,73.41,72.7,71.96,71.21,70.43,69.64,68.83,68.02,67.2,66.4,65.61,64.85,64.1,63.36,62.65,61.94,61.24,60.55,59.86,59.17,58.48,57.78,57.09,56.4,55.71,55.04,54.37,53.71,53.05,52.4,51.76,51.12,50.47,49.82,49.17,48.52,47.86,47.2,46.53,45.85,45.18,44.5,43.81,43.12,42.43,41.74,41.04,40.34,39.63,38.92,38.21,37.49,36.78,36.07,35.36,34.66,33.97,33.3,32.63,31.97,31.31,30.66,30.01,29.37,28.72,28.07,27.43,26.78,26.14,25.5,24.87,24.24,23.62,23.01,22.41,21.81,21.22,20.62,20.02,19.42,18.82,18.21,17.6,17,16.4,15.81,15.24,14.67,14.11,13.56,13.02,12.48,11.94,11.4,10.86,10.33,9.79,9.26,8.73,8.2,7.67,7.15,6.63,6.1,5.57,5.04,4.49,3.94,3.38,2.82,2.25,1.69,1.12,.56,0],elevationSource:`USGS 3DEP`,attribution:`OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP`,courseBuilder:{sections:[[{lat:34.07752395264837,lon:-118.88001070285918}],[{lat:34.07752395264837,lon:-118.88001070285918},{lon:-118.88050317764282,lat:34.07731417172462},{lon:-118.88121128082275,lat:34.07690539153225},{lon:-118.88136148452759,lat:34.07678986633775},{lon:-118.88147950172424,lat:34.07665656784053},{lon:-118.88161897659302,lat:34.076203351380954},{lon:-118.88180136680603,lat:34.07579456582749},{lon:-118.8819408416748,lat:34.07555462556208},{lon:-118.88223052024841,lat:34.07524359087307},{lon:-118.88236999511719,lat:34.07512806341201},{lon:-118.88288497924805,lat:34.0748970080171},{lon:-118.88346433639526,lat:34.07479036685304},{lon:-118.8842260837555,lat:34.0745237633555},{lon:-118.88437628746033,lat:34.07439046129208},{lon:-118.88458013534546,lat:34.07399944069586},{lon:-118.88465523719788,lat:34.07391945898793},{lon:-118.88545989990234,lat:34.07369728718068},{lon:-118.885577917099,lat:34.07362619207933},{lon:-118.8859212398529,lat:34.07331515030921},{lon:-118.88637185096741,lat:34.07318184634384},{lon:-118.88672590255737,lat:34.072986333481836},{lon:-118.88691902160645,lat:34.07292412474929},{lon:-118.88741254806519,lat:34.07300410739701},{lon:-118.88758420944214,lat:34.07296855956292},{lon:-118.8876485824585,lat:34.072915237783775},{lon:-118.88769149780273,lat:34.07283525505213},{lon:-118.88772368431091,lat:34.07263085439483},{lon:-118.88779878616333,lat:34.07257753240313},{lon:-118.88789534568787,lat:34.07255087139468},{lon:-118.88802409172058,lat:34.07256864540125},{lon:-118.8885498046875,lat:34.072817481101495},{lon:-118.88866782188416,lat:34.0728263680773},{lon:-118.88875365257263,lat:34.07278193318909},{lon:-118.88878583908081,lat:34.07273749827755},{lon:-118.8887107372284,lat:34.07240867920795},{lon:-118.88875365257263,lat:34.0722931478805},{lon:-118.88886094093323,lat:34.072213164561504},{lon:-118.88898968696594,lat:34.072204277521394},{lon:-118.88936519622803,lat:34.07227537381614},{lon:-118.88996601104736,lat:34.072213164561504},{lon:-118.89026641845703,lat:34.07223093863891},{lon:-118.8905131816864,lat:34.072204277521394},{lon:-118.89071702957153,lat:34.07213318116699},{lon:-118.89085650444031,lat:34.0720087624032},{lon:-118.89111399650574,lat:34.071546633966406},{lon:-118.89114618301392,lat:34.07137777871644},{lon:-118.89110326766968,lat:34.07120892312993},{lon:-118.89097452163696,lat:34.07104006720684},{lon:-118.89070630073547,lat:34.07083566221806},{lon:-118.89064192771912,lat:34.0707290159412},{lon:-118.89063119888306,lat:34.07061348232308},{lon:-118.89072775840759,lat:34.070444625213185},{lon:-118.89085650444031,lat:34.07038241461419},{lon:-118.89136075973511,lat:34.070275767766745},{lon:-118.89156460762024,lat:34.07016912078508},{lon:-118.89177918434143,lat:34.07012468450307},{lon:-118.89203667640686,lat:34.07013357176133},{lon:-118.89229416847229,lat:34.07019578254307},{lon:-118.89244437217712,lat:34.07018689529133},{lon:-118.89333486557007,lat:34.069938051864185},{lon:-118.89374256134033,lat:34.06975141881419},{lon:-118.89383912086487,lat:34.069635883862915},{lon:-118.89382839202881,lat:34.06946702480455},{lon:-118.8935923576355,lat:34.069102643584586},{lon:-118.89328122138977,lat:34.06882713479247},{lon:-118.89320611953735,lat:34.06867604894548},{lon:-118.89324903488159,lat:34.06859606221151},{lon:-118.89329195022583,lat:34.06856939995008},{lon:-118.89376401901245,lat:34.068533850255136},{lon:-118.89397859573364,lat:34.06843608851706},{lon:-118.89416098594666,lat:34.0683205517721},{lon:-118.89445066452026,lat:34.067885065701944},{lon:-118.89452576637268,lat:34.067467352470274},{lon:-118.8946008682251,lat:34.06738736459525},{lon:-118.89487981796265,lat:34.0672540513024},{lon:-118.89495491981506,lat:34.06717406322598},{lon:-118.8950514793396,lat:34.06677412171132},{lon:-118.89531970024109,lat:34.06637417830888},{lon:-118.89525532722473,lat:34.066000896096725},{lon:-118.89530897140503,lat:34.06592090683732},{lon:-118.89563083648682,lat:34.06572537721868},{lon:-118.89581322669983,lat:34.06547652068784},{lon:-118.89601707458496,lat:34.06463218058313},{lon:-118.89626383781433,lat:34.06415223614178},{lon:-118.8964033126831,lat:34.063796719988204},{lon:-118.89649987220764,lat:34.063672288982104},{lon:-118.89663934707642,lat:34.063574521634834},{lon:-118.89680027961731,lat:34.06337009863515},{lon:-118.89687538146973,lat:34.063005691195286},{lon:-118.89688611030579,lat:34.0626057300063},{lon:-118.89691829681396,lat:34.062410192737985},{lon:-118.89703631401062,lat:34.06198356440471},{lon:-118.89693975448608,lat:34.06137028241291},{lon:-118.8969612121582,lat:34.06119251868709},{lon:-118.89721870422363,lat:34.06015259342037},{lon:-118.89729380607605,lat:34.059601516738994},{lon:-118.89729380607605,lat:34.059317088662766},{lon:-118.89722943305969,lat:34.05881044878765},{lon:-118.8974118232727,lat:34.05851712958102},{lon:-118.8975727558136,lat:34.05798381933194},{lon:-118.89756202697754,lat:34.05793937665969},{lon:-118.89745473861694,lat:34.05787715687943},{lon:-118.89733672142029,lat:34.057903822505125},{lon:-118.8970685005188,lat:34.05805492755901},{lon:-118.89692902565002,lat:34.05803715050783},{lon:-118.89688611030579,lat:34.05795715373138},{lon:-118.89691829681396,lat:34.05787715687943},{lon:-118.89710068702698,lat:34.05760161158922},{lon:-118.8974118232727,lat:34.056979409251795},{lon:-118.89742255210876,lat:34.05686385688624},{lon:-118.89739036560059,lat:34.0567483043632},{lon:-118.89726161956787,lat:34.05658830830197},{lon:-118.89672517776489,lat:34.0562060942666},{lon:-118.89631748199463,lat:34.05615276193858},{lon:-118.89623165130615,lat:34.0561083183063},{lon:-118.89618873596191,lat:34.056054985916774},{lon:-118.89618873596191,lat:34.055983876011894},{lon:-118.89621019363403,lat:34.05592165479618},{lon:-118.89671444892883,lat:34.055414994625224},{lon:-118.89732599258423,lat:34.055228329588346},{lon:-118.89771223068237,lat:34.05517499664515},{lon:-118.89792680740356,lat:34.055103886002044},{lon:-118.89803409576416,lat:34.05503277529928},{lon:-118.89828085899353,lat:34.05474833189173},{lon:-118.8985812664032,lat:34.054481665330286},{lon:-118.89860272407532,lat:34.05435722064787},{lon:-118.8985812664032,lat:34.054259442554965},{lon:-118.89851689338684,lat:34.05417944221324},{lon:-118.89825940132141,lat:34.054054997087164},{lon:-118.89806628227234,lat:34.05389499594233},{lon:-118.89799118041992,lat:34.05376166142429},{lon:-118.89795899391174,lat:34.053539436761525},{lon:-118.89778733253479,lat:34.05327276639726},{lon:-118.89779806137085,lat:34.05322832125499},{lon:-118.89785170555115,lat:34.05315720897889},{lon:-118.8981306552887,lat:34.05302387330043},{lon:-118.898184299469,lat:34.05296164991205},{lon:-118.89821648597717,lat:34.05281053577869},{lon:-118.89826476573944,lat:34.052757201314364},{lon:-118.89873147010803,lat:34.05254386312154},{lon:-118.8990318775177,lat:34.052454972049446},{lon:-118.89910161495209,lat:34.05240163736143},{lon:-118.89927864074707,lat:34.052134963418055},{lon:-118.8993376493454,lat:34.05178384144662},{lon:-118.89931619167328,lat:34.051632725213835},{lon:-118.89914453029633,lat:34.05131715809446},{lon:-118.89854907989502,lat:34.05096603273603},{lon:-118.89838814735413,lat:34.05090380783726},{lon:-118.89822721481323,lat:34.05080602576122},{lon:-118.89795362949371,lat:34.05056157007773},{lon:-118.89761567115784,lat:34.050081545957454},{lon:-118.89748692512512,lat:34.04982819879825},{lon:-118.89741718769073,lat:34.04952595909175},{lon:-118.89743328094482,lat:34.04939261770227},{lon:-118.89740645885468,lat:34.04921038413083},{lon:-118.89719724655151,lat:34.04895258962911},{lon:-118.89708459377289,lat:34.04874813136351},{lon:-118.89693975448608,lat:34.04823698354251},{lon:-118.89679491519928,lat:34.04793473816383},{lon:-118.89682173728943,lat:34.0478280630671},{lon:-118.89689683914185,lat:34.047814728670545},{lon:-118.89698266983032,lat:34.04786806624409},{lon:-118.89719188213348,lat:34.0483392133532},{lon:-118.89734745025635,lat:34.04855700688675},{lon:-118.89761567115784,lat:34.0488192473379},{lon:-118.89771223068237,lat:34.048854805302724},{lon:-118.89778733253479,lat:34.04884591581292},{lon:-118.89781951904297,lat:34.048797023602305},{lon:-118.89780342578888,lat:34.04873035236058},{lon:-118.89755129814148,lat:34.04847700116393},{lon:-118.89746010303497,lat:34.048263652200646},{lon:-118.89742255210876,lat:34.048010299609516},{lon:-118.89748692512512,lat:34.047676939783614},{lon:-118.89788925647736,lat:34.047210233825524},{lon:-118.8978785276413,lat:34.04705021976285},{lon:-118.89772832393646,lat:34.046699076733574},{lon:-118.8976639509201,lat:34.04643238485369},{lon:-118.89769613742828,lat:34.04625014492004},{lon:-118.89783024787903,lat:34.04593900266468},{lon:-118.897824883461,lat:34.04578787601446},{lon:-118.89751374721527,lat:34.04535671909085},{lon:-118.89707386493683,lat:34.04493000492553},{lon:-118.89691829681396,lat:34.04468553230086},{lon:-118.89682710170746,lat:34.04449439866704},{lon:-118.89668762683868,lat:34.04405434517473},{lon:-118.89663398265839,lat:34.04353872403598},{lon:-118.89658033847809,lat:34.0433164725783},{lon:-118.89621019363403,lat:34.04265860484979},{lon:-118.89601171016693,lat:34.042347449416795},{lon:-118.89588296413422,lat:34.04222298692396},{lon:-118.89571130275726,lat:34.04211185954385},{lon:-118.89523386955261,lat:34.04189404945646},{lon:-118.89501392841339,lat:34.041831817900146},{lat:34.04181361609444,lon:-118.89486199579859}]],resolution:5}},{id:`hwy-129-tail-of-the-dragon-1185-711`,closed:!1,name:`US 129 - Tail of the Dragon`,venueName:`US 129`,configName:`Segment 1185–711`,location:{lat:35.52346172436608,lon:-83.98651069904916},width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[825.6,534.52],[819.58,529.22],[813.56,523.93],[807.44,518.76],[801.32,513.59],[795.19,508.43],[789.07,503.26],[782.88,498.16],[776.6,493.18],[770.28,488.26],[763.79,483.56],[757.3,478.86],[750.48,474.67],[743.52,470.7],[736.46,466.91],[729.18,463.56],[721.9,460.21],[714.39,457.44],[706.84,454.75],[699.29,452.06],[691.74,449.37],[684.19,446.69],[676.7,443.83],[669.79,439.93],[665.69,433.23],[664.94,425.36],[667.79,417.91],[673.7,412.54],[680.62,408.52],[687.93,405.24],[695.32,402.15],[702.77,399.21],[710.33,396.56],[717.78,393.59],[724.95,390.04],[731.77,385.83],[738.16,381.03],[743.25,374.88],[746.55,367.63],[748.84,359.95],[751.07,352.26],[753.49,344.61],[755.91,336.97],[758.69,329.49],[762.6,322.5],[767.52,316.18],[772.79,310.14],[778.13,304.17],[783.48,298.2],[788.83,292.24],[792.07,285.02],[792.36,277.14],[790.68,269.34],[787.5,262],[783.95,254.81],[780.31,247.68],[776.04,240.9],[773.35,233.39],[773.4,225.48],[777.47,218.75],[784.29,215.04],[792.16,213.55],[800.14,212.81],[808.12,212.07],[816.08,211.1],[823.98,209.78],[831.77,207.95],[839.17,204.9],[845.01,199.52],[848.44,192.3],[850.55,184.58],[851.73,176.66],[853.54,168.85],[855.58,161.12],[858.67,153.73],[861.96,146.42],[865.26,139.12],[866.72,131.28],[865.88,123.32],[862.48,116.08],[857.33,110.02],[850.79,105.49],[843.27,102.87],[835.27,102.71],[827.32,103.59],[819.43,104.99],[811.61,106.76],[803.8,108.52],[795.98,110.29],[788.16,112.06],[780.36,113.89],[772.58,115.79],[764.79,117.7],[757.01,119.6],[749.23,121.51],[741.44,123.41],[733.7,125.48],[725.97,127.6],[718.31,129.95],[710.73,132.53],[703.46,135.89],[696.35,139.6],[689.4,143.58],[682.41,147.49],[675.23,151.03],[667.63,153.45],[659.68,153.26],[652.26,150.56],[646.38,145.3],[642.52,138.3],[640.7,130.54],[639.66,122.59],[638.94,114.62],[638.32,106.63],[636.94,98.76],[633.13,91.84],[626.7,87.26],[618.78,86.47],[610.79,87.1],[602.81,87.79],[594.82,88.49],[586.98,89.94],[579.32,92.28],[571.7,94.74],[564.46,98.17],[557.21,101.59],[551.36,106.94],[545.83,112.74],[540.66,118.86],[535.49,124.99],[529.13,129.64],[521.6,132.14],[513.66,131.72],[506.85,127.99],[503.14,120.98],[499.9,113.65],[495.63,106.87],[489.93,101.38],[482.26,99.41],[474.37,100.48],[467.21,103.92],[461.1,109.04],[456.37,115.48],[452.1,122.25],[448.24,129.27],[444.38,136.3],[440.52,143.32],[436.82,150.43],[433.17,157.56],[430.03,164.91],[427.8,172.57],[427.28,180.52],[428.83,188.39],[430.37,196.25],[432.53,203.96],[434.94,211.6],[437.15,219.29],[438.24,227.23],[437.51,235.15],[435.39,242.83],[431.76,249.91],[427.11,256.43],[422.11,262.69],[416.97,268.83],[412.54,275.48],[408.76,282.51],[406.9,290.3],[405.03,298.1],[402.97,305.84],[400.66,313.51],[398.08,321.03],[392.41,326.69],[385.36,330.21],[377.63,330.17],[369.78,328.57],[362.2,325.97],[354.62,323.38],[346.9,321.71],[338.89,321.99],[331.28,324.43],[325.09,329.22],[320.17,335.4],[317.82,342.92],[318.7,350.89],[319.46,358.87],[319.98,366.86],[319.34,374.76],[317.48,382.56],[314.6,389.98],[310.98,397.13],[307.36,404.28],[303.74,411.43],[300.12,418.58],[298.08,426.33],[296.07,434.08],[297.61,441.89],[300.61,449.29],[304.59,456.25],[308.81,463.05],[313.13,469.8],[316.16,477.21],[317.18,485.02],[313.89,492.08],[306.87,495.8],[299.03,497.19],[291.62,494.59],[285.34,489.66],[280.38,483.37],[275.92,476.74],[272.26,469.62],[269.15,462.24],[266.04,454.85],[263.11,447.39],[260.19,439.93],[258.02,432.22],[255.84,424.5],[254.04,416.7],[252.3,408.87],[249.69,401.37],[245.81,394.39],[240.35,388.53],[233.87,384.05],[226.52,381.03],[218.53,380.45],[210.53,380.16],[202.52,380.34],[194.64,381.73],[186.78,383.28],[178.91,384.82],[171.05,386.36],[163.18,387.9],[155.35,389.54],[147.95,392.63],[140.56,395.72],[133.17,398.81],[126.02,402.44],[118.87,406.07],[111.73,409.69],[104.71,413.55],[97.8,417.62],[90.9,421.68],[83.87,425.51],[76.32,428.01],[68.31,428.31],[60.4,427.06],[52.82,424.6],[45.18,422.17],[37.5,419.91],[29.52,419.99],[21.71,421.63],[14.21,424.32],[7.02,427.87],[.02,431.76],[-6.96,435.7],[-13.94,439.64],[-20.85,443.69],[-27.42,448.27],[-34,452.86],[-40.57,457.44],[-47.14,462.03],[-53.72,466.61],[-60.29,471.19],[-66.89,475.73],[-73.67,480.01],[-80.45,484.29],[-87.38,488.29],[-94.67,491.49],[-102.51,492.65],[-109.98,490.31],[-114.73,484.22],[-115.55,476.27],[-114.9,468.3],[-113.42,460.46],[-110.74,452.9],[-108.06,445.35],[-105.38,437.8],[-102.69,430.25],[-100.01,422.7],[-97.58,415.07],[-95.42,407.35],[-93.18,399.66],[-90.83,391.99],[-88.48,384.33],[-85.74,376.8],[-83,369.27],[-79.89,361.9],[-76.4,354.68],[-72.91,347.47],[-69.43,340.25],[-65.94,333.04],[-64.23,325.24],[-64.86,317.35],[-67.89,310],[-73.42,304.21],[-79.35,298.83],[-85.5,293.69],[-91.65,288.55],[-97.8,283.42],[-104.01,278.35],[-110.35,273.45],[-117.44,269.84],[-125.28,268.24],[-133.28,268.1],[-141.26,268.83],[-149.27,268.99],[-157.22,268.47],[-164.73,265.75],[-170.14,260.04],[-171.62,252.3],[-170.63,244.38],[-167.8,236.9],[-164.87,229.44],[-162.7,221.76],[-161.14,213.9],[-159.59,206.04],[-158.97,198.07],[-158.64,190.06],[-158.44,182.06],[-159.47,174.11],[-160.5,166.16],[-163.56,158.78],[-166.77,151.44],[-170.29,144.25],[-175.06,137.83],[-180.42,131.88],[-185.93,126.06],[-191.44,120.24],[-196.85,114.34],[-201.29,107.72],[-203.55,100.09],[-202.92,92.18],[-198.88,85.41],[-193.09,79.9],[-186.06,76.04],[-179.04,72.18],[-172.02,68.32],[-164.99,64.46],[-158.92,59.24],[-154.93,52.39],[-153.76,44.54],[-155.19,36.69],[-158.69,29.48],[-162.72,22.57],[-167.01,15.8],[-172.06,9.58],[-175.75,2.57],[-177.02,-5.34],[-175.49,-13.15],[-170.45,-19.11],[-163.31,-22.75],[-155.72,-25.24],[-147.99,-27.34],[-140.43,-29.99],[-132.89,-32.69],[-125.77,-36.32],[-118.86,-40.37],[-113.22,-46.03],[-109.08,-52.81],[-107.19,-60.58],[-106.67,-68.56],[-107.76,-76.49],[-109.91,-84.19],[-113.51,-91.31],[-118.79,-97.3],[-125.59,-101.48],[-132.97,-104.58],[-140.42,-107.55],[-147.86,-110.52],[-154.99,-114.17],[-161.27,-119.09],[-165.68,-125.66],[-167.42,-133.44],[-166.08,-141.33],[-162.52,-148.42],[-158.29,-155.23],[-154.07,-162.04],[-149.85,-168.85],[-145.79,-175.75],[-142.96,-183.23],[-141.91,-191.12],[-144.17,-198.76],[-148.57,-205.43],[-153.97,-211.34],[-159.68,-216.95],[-165.51,-222.43],[-169.73,-229.17],[-171.74,-236.86],[-169.28,-244.42],[-164.92,-251.12],[-160.09,-257.51],[-154.89,-263.61],[-149.26,-269.26],[-142.97,-274.22],[-136.34,-278.67],[-128.99,-281.8],[-121.43,-284.45],[-113.71,-286.61],[-105.97,-288.68],[-98.23,-290.76],[-90.59,-293.1],[-83.28,-296.39],[-76.04,-299.8],[-69.83,-304.86],[-63.61,-309.92],[-58.73,-316.25],[-53.99,-322.71],[-50.07,-329.66],[-46.58,-336.88],[-43.1,-344.09],[-40.63,-351.71],[-39.03,-359.56],[-39.36,-367.44],[-44.36,-373.62],[-51.3,-377.43],[-58.97,-379.69],[-66.8,-381.38],[-74.67,-382.87],[-82.53,-384.43],[-90.36,-386.15],[-98.17,-387.94],[-105.94,-389.9],[-113.71,-391.87],[-121.48,-393.83],[-129.25,-395.79],[-137.02,-397.75],[-144.85,-399.45],[-152.7,-401.06],[-160.59,-402.41],[-168.56,-403.24],[-176.57,-403.4],[-184.58,-403.51],[-192.59,-403.33],[-200.6,-403.07],[-208.61,-402.81],[-216.62,-402.55],[-224.63,-402.29],[-232.64,-402.02],[-240.63,-401.33],[-248.5,-399.89],[-256.05,-397.22],[-263.1,-393.45],[-269.65,-388.83],[-276.04,-384.01],[-281.91,-378.55],[-287.78,-373.1],[-293.65,-367.64],[-299.52,-362.19],[-305.39,-356.73],[-311.26,-351.28],[-317.1,-345.79],[-322.61,-339.97],[-328.12,-334.15],[-333.63,-328.33],[-338.3,-321.84],[-342.59,-315.08],[-346.38,-308.02],[-349.64,-300.71],[-352.7,-293.3],[-355.76,-285.9],[-358.63,-278.42],[-361.5,-270.93],[-363.87,-263.28],[-365.83,-255.52],[-367.4,-247.66],[-368.98,-239.8],[-370.55,-231.95],[-372.39,-224.16],[-376.7,-217.5],[-382.87,-212.43],[-390.34,-209.64],[-398.25,-208.48],[-406.26,-208.3],[-414.23,-208.97],[-422.05,-210.53],[-429.21,-214.06],[-434.57,-219.95],[-437.54,-227.32],[-438.44,-235.27],[-438.6,-243.28],[-439.08,-251.27],[-440.55,-259.13],[-443.7,-266.48],[-448.22,-273.06],[-454.46,-278.05],[-462.05,-280.5],[-470.01,-281.25],[-477.94,-280.35],[-485.78,-278.69],[-493.52,-276.67],[-501.2,-274.39],[-509.01,-272.62],[-516.97,-271.69],[-524.97,-272.18],[-532.81,-273.85],[-540.08,-277.15],[-547.02,-281.16],[-553.24,-286.2],[-558.82,-291.91],[-562.57,-298.95],[-564.64,-306.65],[-563.55,-314.53],[-560.67,-321.98],[-556.55,-328.85],[-552.91,-335.96],[-551.28,-343.75],[-551.63,-351.74],[-553.64,-359.46],[-557.91,-366.19],[-564.01,-371.22],[-570.88,-375.3],[-578.62,-377.18],[-586.61,-376.82],[-594.26,-374.5],[-601.25,-370.63],[-607.55,-365.7],[-613.07,-359.9],[-618.37,-353.89],[-623.37,-347.63],[-628.23,-341.26],[-632.27,-334.34],[-635.01,-326.85],[-635.83,-318.9],[-635.1,-310.94],[-633.52,-303.09],[-631.95,-295.23],[-631.72,-287.28],[-634.27,-279.75],[-639.51,-273.79],[-646.27,-269.54],[-653.9,-267.22],[-661.81,-266.77],[-669.57,-268.61],[-676.81,-271.9],[-681.99,-277.95],[-685.21,-285.26],[-687.69,-292.87],[-688.98,-300.78],[-689.85,-308.75],[-690.6,-316.72],[-690.71,-324.73],[-690.21,-332.73],[-689.48,-340.71],[-688.57,-348.67],[-687.27,-356.57],[-685.16,-364.3],[-682.87,-371.98],[-680.49,-379.63],[-678.1,-387.28],[-675.62,-394.9],[-673.15,-402.52],[-670.68,-410.15],[-668.2,-417.77],[-665.73,-425.39],[-663.61,-433.12],[-661.68,-440.9],[-659.89,-448.71],[-660.23,-456.71],[-661.51,-464.59],[-664.58,-471.95],[-668.4,-478.95],[-673.65,-485],[-679.78,-490.07],[-687.2,-493.09],[-695.07,-494.11],[-702.95,-492.74],[-710.19,-489.38],[-717.02,-485.2],[-723.52,-480.52],[-730.03,-475.85],[-736.35,-470.92],[-742.61,-465.92],[-749.23,-461.51],[-756.82,-458.94],[-764.72,-458.49],[-771.76,-462.04],[-775.42,-469.12],[-775.86,-476.97],[-773.76,-484.66],[-770,-491.74],[-766.04,-498.7],[-762.08,-505.67],[-758.12,-512.64],[-755.07,-520.03],[-752.76,-527.68],[-751.83,-535.6],[-752.11,-543.59],[-754.42,-551.22],[-758.12,-558.29],[-763.13,-564.53],[-768.75,-570.19],[-775.22,-574.91],[-782.27,-578.67],[-789.68,-581.73],[-797.14,-584.65],[-804.6,-587.57],[-811.81,-591.06],[-818.65,-595.22],[-825.29,-599.72],[-831.91,-604.24],[-838.55,-608.71],[-845.58,-612.56],[-852.79,-616.04],[-860.16,-619.2]],elevation:[40.28,40.04,39.81,39.58,39.36,39.15,38.95,38.77,38.59,38.44,38.31,38.2,38.12,38.06,38.04,38.04,38.05,38.09,38.14,38.19,38.25,38.32,38.39,38.46,38.53,38.61,38.7,38.79,38.89,38.99,39.09,39.18,39.28,39.37,39.46,39.54,39.62,39.7,39.8,39.92,40.07,40.24,40.44,40.66,40.88,41.11,41.33,41.55,41.77,42,42.22,42.45,42.68,42.9,43.12,43.33,43.54,43.74,43.95,44.17,44.39,44.63,44.87,45.13,45.39,45.65,45.91,46.16,46.42,46.68,46.94,47.21,47.48,47.76,48.04,48.31,48.58,48.85,49.12,49.39,49.66,49.92,50.18,50.43,50.67,50.91,51.13,51.35,51.57,51.79,52.01,52.24,52.48,52.75,53.03,53.34,53.66,54,54.33,54.66,54.99,55.3,55.6,55.9,56.18,56.46,56.73,56.99,57.25,57.51,57.76,58,58.24,58.48,58.71,58.95,59.2,59.46,59.73,60.01,60.3,60.6,60.91,61.23,61.56,61.89,62.22,62.55,62.88,63.2,63.52,63.82,64.13,64.42,64.71,64.99,65.27,65.55,65.83,66.11,66.39,66.68,66.97,67.26,67.56,67.86,68.16,68.46,68.75,69.04,69.32,69.6,69.88,70.15,70.42,70.69,70.95,71.22,71.48,71.74,72,72.25,72.51,72.75,73,73.23,73.47,73.7,73.93,74.17,74.41,74.66,74.92,75.17,75.43,75.7,75.97,76.24,76.51,76.78,77.06,77.33,77.6,77.86,78.12,78.37,78.61,78.83,79.06,79.27,79.49,79.71,79.94,80.17,80.41,80.64,80.88,81.1,81.33,81.54,81.75,81.95,82.15,82.35,82.56,82.77,82.98,83.21,83.44,83.67,83.91,84.15,84.37,84.58,84.77,84.95,85.12,85.28,85.44,85.61,85.77,85.93,86.07,86.18,86.24,86.26,86.23,86.18,86.12,86.06,86.04,86.06,86.12,86.23,86.38,86.57,86.78,87.01,87.22,87.42,87.59,87.73,87.83,87.89,87.93,87.95,87.96,87.98,88.01,88.06,88.12,88.2,88.29,88.4,88.51,88.64,88.77,88.9,89.03,89.14,89.24,89.32,89.38,89.41,89.43,89.43,89.4,89.37,89.32,89.26,89.18,89.09,89,88.91,88.83,88.75,88.69,88.65,88.62,88.59,88.57,88.54,88.51,88.48,88.44,88.4,88.36,88.32,88.27,88.23,88.19,88.15,88.11,88.06,88.01,87.94,87.86,87.76,87.65,87.54,87.44,87.36,87.31,87.28,87.26,87.24,87.22,87.18,87.13,87.07,87.01,86.95,86.89,86.82,86.75,86.66,86.56,86.45,86.33,86.2,86.06,85.93,85.81,85.69,85.59,85.49,85.4,85.32,85.24,85.15,85.06,84.95,84.83,84.71,84.58,84.45,84.32,84.19,84.07,83.96,83.84,83.73,83.62,83.5,83.38,83.27,83.15,83.04,82.94,82.84,82.74,82.65,82.55,82.46,82.36,82.25,82.15,82.04,81.94,81.84,81.74,81.63,81.53,81.42,81.31,81.2,81.08,80.96,80.84,80.72,80.59,80.47,80.34,80.22,80.1,79.99,79.87,79.75,79.61,79.46,79.3,79.13,78.95,78.78,78.64,78.52,78.44,78.38,78.35,78.33,78.31,78.29,78.27,78.25,78.22,78.19,78.15,78.12,78.08,78.04,77.99,77.94,77.88,77.82,77.76,77.69,77.62,77.54,77.46,77.39,77.31,77.24,77.16,77.09,77.01,76.93,76.85,76.76,76.67,76.58,76.5,76.42,76.34,76.28,76.23,76.19,76.16,76.16,76.17,76.21,76.27,76.36,76.49,76.66,76.89,77.16,77.49,77.86,78.25,78.64,78.99,79.27,79.44,79.5,79.45,79.33,79.18,79.03,78.92,78.86,78.85,78.88,78.95,79.04,79.14,79.24,79.34,79.44,79.54,79.66,79.78,79.9,80.04,80.17,80.3,80.43,80.55,80.66,80.76,80.85,80.93,81,81.07,81.13,81.19,81.26,81.32,81.39,81.47,81.54,81.62,81.7,81.78,81.86,81.92,81.99,82.04,82.1,82.15,82.21,82.28,82.36,82.45,82.54,82.64,82.74,82.84,82.94,83.04,83.14,83.24,83.35,83.45,83.54,83.64,83.73,83.82,83.9,83.99,84.07,84.16,84.25,84.34,84.44,84.53,84.63,84.72,84.81,84.9,84.98,85.05,85.1,85.14,85.16,85.16,85.16,85.14,85.12,85.1,85.09,85.08,85.08,85.08,85.09,85.09,85.1,85.1,85.1,85.09,85.06,85.02,84.97,84.89,84.8,84.69,84.57,84.45,84.32,84.2,84.09,83.98,83.88,83.8,83.72,83.65,83.59,83.53,83.47,83.4,83.33,83.25,83.17,83.08,82.98,82.88,82.77,82.66,82.55,82.45,82.34,82.24,82.15,82.05,81.95,81.85,81.75,81.64,81.53,81.42,81.32,81.21,81.11,81.02,80.92,80.83,80.73,80.63,80.53,80.41,80.29,80.16,80.04,79.91,79.79,79.68,79.58,79.49,79.41,79.33,79.26,79.2,79.14,79.08,79.02,78.95,78.87,78.79,78.69,78.59,78.47,78.35,78.23,78.1,77.98,77.87,77.76,77.67,77.58,77.49,77.41,77.33,77.24,77.15,77.04,76.93,76.81,76.69,76.57,76.47,76.39,76.33,76.29,76.27,76.26,76.26,76.25,76.23,76.2,76.16,76.11,76.06,76.01,75.96,75.9,75.85,75.78,75.71,75.61,75.51,75.38,75.26,75.14,75.03,74.96,74.91,74.89,74.88,74.87,74.86,74.83,74.77,74.71,74.62,74.53,74.44,74.35,74.26,74.17,74.08,73.99,73.9,73.81,73.73,73.64,73.56,73.49,73.41,73.34,73.27,73.19,73.12,73.05,72.99,72.92,72.86,72.81,72.76,72.73,72.69,72.66,72.64,72.61,72.59,72.56,72.52,72.48,72.43,72.38,72.31,72.25,72.17,72.1,72.02,71.93,71.83,71.72,71.59,71.44,71.25,71.04,70.81,70.55,70.27,69.97,69.67,69.35,69.03,68.71,68.38,68.05,67.72,67.39,67.07,66.74,66.43,66.12,65.82,65.52,65.23,64.94,64.65,64.36,64.07,63.78,63.5,63.22,62.94,62.66,62.39,62.11,61.84,61.57,61.29,61.01,60.74,60.46,60.19,59.93,59.66,59.41,59.15,58.89,58.63,58.35,58.07,57.76,57.45,57.13,56.81,56.48,56.17,55.87,55.58,55.29,55.02,54.75,54.49,54.22,53.94,53.66,53.36,53.06,52.75,52.43,52.12,51.8,51.5,51.2,50.9,50.61,50.32,50.04,49.75,49.47,49.19,48.91,48.63,48.34,48.06,47.77,47.47,47.18,46.87,46.56,46.25,45.94,45.63,45.32,45.02,44.74,44.47,44.21,43.97,43.73,43.51,43.28,43.05,42.82,42.59,42.34,42.09,41.82,41.55,41.26,40.97,40.67,40.37,40.06,39.75,39.45,39.16,38.87,38.58,38.31,38.05,37.79,37.53,37.28,37.02,36.77,36.52,36.26,36,35.73,35.46,35.18,34.89,34.6,34.29,33.99,33.68,33.37,33.07,32.77,32.47,32.17,31.87,31.58,31.3,31.02,30.74,30.48,30.23,29.99,29.74,29.5,29.25,28.99,28.72,28.44,28.15,27.85,27.55,27.26,26.97,26.68,26.4,26.13,25.86,25.59,25.33,25.06,24.79,24.51,24.24,23.95,23.67,23.38,23.09,22.8,22.5,22.22,21.93,21.65,21.37,21.09,20.82,20.54,20.26,19.98,19.69,19.39,19.08,18.77,18.46,18.15,17.85,17.54,17.25,16.96,16.68,16.41,16.15,15.91,15.67,15.44,15.22,15,14.79,14.57,14.35,14.13,13.9,13.66,13.41,13.16,12.91,12.67,12.43,12.2,11.97,11.74,11.51,11.28,11.04,10.81,10.56,10.32,10.07,9.81,9.54,9.26,8.96,8.67,8.36,8.05,7.74,7.44,7.14,6.85,6.57,6.29,6.01,5.73,5.46,5.18,4.9,4.61,4.32,4.02,3.71,3.41,3.12,2.83,2.56,2.3,2.05,1.81,1.56,1.32,1.07,.81,.54,.27,0],elevationSource:`USGS 3DEP`},{id:`hwy-193-chili-bar-710-1042`,closed:!1,name:`CA SR 193 - Chili Bar`,venueName:`Georgetown Road`,configName:`Segment 710–1042`,location:{lat:38.829181750891465,lon:-120.85557341669359},width:8,shoulderWidth:.5,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[-237.45,980.67],[-238.01,972.67],[-238.56,964.68],[-239.11,956.68],[-239.66,948.68],[-240.25,940.69],[-240.84,932.69],[-241.44,924.7],[-241.85,916.69],[-241.98,908.68],[-241.81,900.66],[-241.35,892.66],[-239.99,884.78],[-238.02,877.02],[-235.31,869.5],[-231.33,862.55],[-226.75,855.97],[-221.86,849.62],[-216.79,843.41],[-211.76,837.17],[-206.95,830.76],[-202.66,823.99],[-198.88,816.92],[-195.56,809.64],[-192.67,802.17],[-190.24,794.52],[-187.82,786.88],[-184.81,779.48],[-180.63,772.67],[-174.97,767.09],[-168.37,762.55],[-161.64,758.19],[-154.95,753.77],[-148.75,748.7],[-143.3,742.82],[-138.9,736.13],[-135.26,728.99],[-131.9,721.71],[-128.69,714.36],[-125.45,707.03],[-121.77,699.92],[-117.13,693.43],[-111.07,688.2],[-104.18,684.21],[-96.72,681.28],[-89.12,678.72],[-81.53,676.16],[-74.37,672.57],[-67.5,668.48],[-61.12,663.63],[-55.25,658.19],[-50.04,652.11],[-45.81,645.33],[-43.14,637.79],[-41.41,629.96],[-40.07,622.06],[-38.79,614.14],[-37.59,606.22],[-35.83,598.4],[-33.38,590.77],[-30.2,583.41],[-26.85,576.13],[-23.75,568.75],[-21.7,561.01],[-20.12,553.15],[-18.71,545.26],[-15.73,537.88],[-10.54,531.81],[-4.35,526.74],[2.77,523.05],[9.89,519.37],[17.01,515.68],[24.16,512.05],[31.35,508.51],[38.54,504.97],[45.74,501.43],[52.9,497.84],[59,492.64],[65.1,487.44],[70.66,481.71],[74.31,474.6],[75.21,466.66],[74.63,458.69],[72.26,451.04],[69.84,443.39],[67.43,435.75],[66.07,427.89],[67.68,420.18],[72.86,414.14],[78.56,408.5],[84.25,402.85],[89.94,397.2],[95.63,391.56],[100.6,385.31],[104.12,378.11],[105.89,370.34],[104.41,362.55],[101.1,355.26],[96.6,348.63],[92.09,342],[87.58,335.37],[83.54,328.46],[79.92,321.31],[78.27,313.49],[79.09,305.59],[82.32,298.38],[87.44,292.22],[93.78,287.33],[100.63,283.18],[107.66,279.32],[114.69,275.46],[122.01,272.38],[129.84,270.67],[137.73,269.37],[145.73,268.89],[153.73,268.41],[161.73,267.85],[169.72,267.23],[177.06,264.07],[182.09,257.98],[183.83,250.33],[182.07,242.51],[179.05,235.09],[175.95,227.7],[173.1,220.22],[171.44,212.47],[172.99,204.65],[177.5,198.05],[183.51,192.74],[190.87,189.64],[198.32,186.66],[205.85,184],[213.69,182.29],[221.52,180.59],[229.37,178.94],[237.25,177.51],[245.14,176.08],[253.03,174.65],[260.92,173.22],[268.9,172.56],[276.9,172.15],[284.91,171.74],[292.9,172.32],[300.89,172.96],[308.87,173.74],[316.81,174.85],[324.75,175.95],[332.69,177.05],[340.66,177.58],[348.67,177.31],[356.69,177.05],[364.7,176.77],[372.71,176.43],[380.72,176.09],[388.73,175.74],[396.74,175.4],[404.74,175.04],[412.73,174.34],[420.72,173.63],[428.7,172.92],[436.55,171.32],[444.38,169.58],[452.2,167.85],[460.03,166.12],[467.86,164.38],[475.71,162.76],[483.56,161.17],[491.42,159.58],[499.28,157.98],[507.13,156.36],[514.62,153.56],[521.86,150.15],[528.92,146.34],[535.98,142.54],[543.61,140.11],[551.59,139.76],[559.52,140.91],[567.43,142.19],[575.39,142.93],[583.27,142.2],[590.81,139.47],[597.05,134.46],[600.14,127.14],[600.51,119.22],[600.1,111.22],[598.98,103.29],[597.85,95.35],[596.73,87.41],[595.46,79.49],[594.15,71.59],[592.71,63.7],[590.81,55.91],[588.11,48.45],[583,42.4],[576.23,38.19],[568.94,34.94],[561.26,32.64],[553.5,30.64],[545.67,28.93],[537.84,27.22],[530,25.51],[522.17,23.81],[514.34,22.1],[506.51,20.39],[499.01,17.63],[491.62,14.51],[484.99,10.09],[478.58,5.27],[473.37,-.7],[468.82,-7.3],[464.53,-14.03],[462.16,-21.69],[459.78,-29.34],[458.97,-37.21],[459.18,-45.23],[460.28,-53.14],[461.91,-60.99],[465.49,-68.1],[469.48,-75.05],[473.85,-81.69],[479.84,-87.03],[485.83,-92.35],[492.8,-96.32],[499.76,-100.29],[506.73,-104.26],[513.69,-108.23],[520.66,-112.2],[527.62,-116.17],[534.59,-120.14],[541.55,-124.11],[548.52,-128.08],[555.29,-132.33],[561.54,-137.34],[567.8,-142.35],[574.06,-147.37],[580.31,-152.38],[586.57,-157.4],[592.77,-162.46],[598.57,-168.01],[604.36,-173.55],[610.15,-179.1],[615.44,-185.02],[619.34,-192.03],[622.64,-199.25],[624.19,-207.12],[624.9,-215.04],[624,-222.96],[621.47,-230.57],[616.54,-236.78],[611.19,-242.75],[605.44,-248.22],[598.38,-252.01],[591.32,-255.8],[584.25,-259.59],[576.75,-262.38],[569.18,-265.03],[561.62,-267.68],[554.05,-270.33],[546.48,-272.98],[538.92,-275.63],[531.35,-278.28],[523.84,-281.08],[516.34,-283.91],[508.84,-286.73],[501.33,-289.56],[493.83,-292.38],[486.33,-295.21],[478.83,-298.03],[471.32,-300.86],[463.82,-303.68],[456.32,-306.51],[448.82,-309.33],[441.31,-312.16],[433.81,-314.98],[426.31,-317.81],[418.8,-320.63],[411.3,-323.46],[403.8,-326.28],[396.17,-328.72],[388.42,-330.77],[380.54,-332],[372.54,-332.49],[364.55,-331.99],[356.58,-331.2],[348.92,-328.85],[341.39,-326.16],[334.38,-322.28],[327.36,-318.41],[321.41,-313.04],[315.76,-307.39],[310.89,-301.02],[306.18,-294.55],[302.77,-287.3],[299.61,-279.95],[297.45,-272.23],[295.28,-264.51],[293.12,-256.79],[291.06,-249.05],[289,-241.3],[286.73,-233.61],[284.12,-226.04],[279.53,-219.54],[273.85,-213.92],[266.71,-210.51],[258.94,-208.77],[250.98,-207.85],[243.03,-208.69],[235.17,-210.2],[227.44,-212.3],[219.55,-213.49],[211.55,-213.97],[203.66,-212.56],[196.23,-209.68],[189.35,-205.63],[183.09,-200.73],[178.48,-194.17],[174.62,-187.17],[171.5,-179.81],[169.41,-172.08],[167.33,-164.33],[165.52,-156.52],[163.72,-148.71],[161.94,-140.89],[160.34,-133.04],[158.74,-125.18],[157.15,-117.33],[155.55,-109.47],[153.67,-101.68],[151.72,-93.9],[149.1,-86.33],[145.76,-79.1],[140.33,-73.39],[133.23,-69.84],[125.45,-69.13],[117.88,-71.5],[111.41,-76.04],[105.85,-81.81],[100.39,-87.68],[94.93,-93.55],[89.02,-98.95],[82.89,-104.11],[76.4,-108.8],[69.73,-113.25],[63.06,-117.7],[56.03,-121.54],[48.91,-125.22],[41.79,-128.9],[34.85,-132.89],[28.05,-137.14],[21.25,-141.39],[15.5,-146.96],[9.83,-152.63],[4.16,-158.3],[-1.51,-163.96],[-7.12,-169.68],[-12.54,-175.59],[-17.87,-181.57],[-22.59,-188.05],[-26.8,-194.87],[-30.79,-201.82],[-34.6,-208.86],[-37.91,-216.16],[-41.23,-223.46],[-44.55,-230.76],[-47.94,-238.02],[-51.33,-245.29],[-54.71,-252.56],[-58.18,-259.78],[-62,-266.83],[-65.82,-273.88],[-70.88,-280.06],[-77.47,-284.54],[-85.28,-286.05],[-93.24,-285.36],[-100.9,-283.06],[-107.86,-279.11],[-114.26,-274.28],[-119.8,-268.55],[-124.93,-262.39],[-129.91,-256.11],[-134.37,-249.46],[-137.08,-241.94],[-139.62,-234.33],[-142.71,-226.95],[-146.83,-220.13],[-152.56,-214.64],[-159.77,-211.47],[-167.68,-210.91],[-175.68,-211.45],[-183.64,-212.41],[-191.57,-213.52],[-199.51,-214.67],[-207.38,-216.12],[-215.04,-218.46],[-222.71,-220.8],[-230.04,-223.98],[-237.23,-227.54],[-244.22,-231.46],[-251.17,-235.46],[-257.97,-239.7],[-264.65,-244.12],[-271.34,-248.55],[-277.87,-253.18],[-284.25,-258.04],[-290.63,-262.89],[-297.19,-267.5],[-303.78,-272.07],[-310.69,-276.1],[-317.84,-279.73],[-325.48,-281.93],[-333.46,-282.63],[-341.41,-281.83],[-349.33,-280.62],[-357.2,-279.09],[-365.08,-277.62],[-372.99,-276.28],[-380.95,-275.37],[-388.93,-274.61],[-396.9,-273.78],[-404.7,-272.15],[-412.02,-269.01],[-418.38,-264.18],[-424.08,-258.55],[-429.67,-252.81],[-435,-246.82],[-440.33,-240.83],[-445.65,-234.84],[-451.8,-229.69],[-458.57,-225.63],[-466.16,-223.09],[-474.12,-222.15],[-482.08,-221.22],[-490.07,-220.49],[-498.05,-219.81],[-506.04,-219.12],[-514.03,-218.45],[-522.03,-218.85],[-530.04,-219.25],[-537.6,-221.68],[-543.7,-226.69],[-546.7,-234],[-547.61,-241.91],[-544.79,-249.08],[-538.48,-253.85],[-530.79,-255.52],[-522.91,-254.68],[-515.32,-252.09],[-507.9,-249.05],[-500.49,-246],[-492.72,-244.02],[-484.78,-243.09],[-476.86,-244.18],[-469.23,-246.35],[-462.83,-251.09],[-457.5,-257.09],[-452.4,-263.27],[-447.47,-269.59],[-442.55,-275.92],[-437.82,-282.39],[-433.02,-288.81],[-427.35,-294.47],[-420.67,-298.82],[-413.56,-302.5],[-406.3,-305.9],[-399.27,-309.76],[-392.5,-314.04],[-386.41,-319.16],[-380.7,-324.79],[-374.68,-330.08],[-368.66,-335.37],[-362.32,-340.19],[-354.96,-343.24],[-347.1,-344.83],[-339.12,-345.57],[-331.15,-345.13],[-323.26,-343.83],[-315.58,-341.55],[-307.98,-339.01],[-300.61,-335.86],[-293.24,-332.71],[-285.9,-329.49],[-278.72,-325.94],[-271.53,-322.38],[-264.34,-318.83],[-257.16,-315.27],[-249.97,-311.72],[-242.78,-308.17],[-235.56,-304.71],[-227.84,-302.82],[-220.01,-303.74],[-213.15,-307.71],[-208.86,-314.27],[-205.9,-321.71],[-203.83,-329.43],[-202.55,-337.34],[-201.48,-345.28],[-200.67,-353.26],[-199.85,-361.23],[-198.93,-369.2],[-197.3,-377.02],[-194.18,-384.33],[-189.08,-390.45],[-182.93,-395.59],[-176.9,-400.87],[-171.96,-407.12],[-168.15,-414.12],[-165.52,-421.67],[-163.75,-429.49],[-162.23,-437.36],[-160.3,-445.14],[-157.81,-452.74],[-154.29,-459.92],[-149.6,-466.42],[-143.66,-471.74],[-136.98,-476.14],[-129.91,-479.9],[-122.56,-483.1],[-115.15,-486.14],[-107.53,-488.64],[-99.8,-490.72],[-92.02,-492.65],[-84.02,-493.17],[-76.07,-492.2],[-68.22,-490.64],[-60.75,-487.9],[-53.74,-484.01],[-46.73,-480.12],[-39.72,-476.23],[-32.71,-472.34],[-25.7,-468.46],[-18.73,-464.5],[-11.81,-460.45],[-5.16,-456],[1.24,-451.17],[8.67,-448.2],[16.41,-448.91],[23.11,-453.1],[26.98,-459.94],[27.1,-467.93],[24.24,-475.4],[19.99,-482.14],[14.88,-488.31],[9.77,-494.49],[4.66,-500.67],[-.35,-506.92],[-4.99,-513.46],[-9.64,-519.99],[-13.61,-526.94],[-17.44,-533.99],[-21.26,-541.04],[-25.36,-547.93],[-29.46,-554.82],[-33.55,-561.71],[-38.15,-568.27],[-42.84,-574.78],[-47.95,-580.95],[-53.06,-587.13],[-58.17,-593.3],[-62.64,-599.94],[-66.84,-606.77],[-70.21,-614],[-73,-621.52],[-75.8,-629.03],[-78.41,-636.6],[-80.35,-644.38],[-82.3,-652.16],[-84.24,-659.93],[-85.64,-667.83],[-86.98,-675.73],[-88.24,-683.64],[-89,-691.62],[-89.16,-699.59],[-87.97,-707.52],[-85.56,-715.08],[-81.68,-722.06],[-76.98,-728.53],[-70.9,-733.76],[-64.83,-738.99],[-58.75,-744.22],[-53.22,-750.01],[-47.83,-755.94],[-42.72,-762.11],[-37.91,-768.52],[-33.09,-774.93],[-28.28,-781.34],[-23.71,-787.93],[-19.33,-794.64],[-14.95,-801.36],[-10.57,-808.07],[-6.2,-814.79],[-.88,-820.79],[4.47,-826.75],[9.83,-832.71],[15.19,-838.68],[20.54,-844.64],[25.9,-850.61],[31.26,-856.57],[36.61,-862.54],[41.97,-868.5]],elevation:[295.69,295.42,295.16,294.91,294.67,294.44,294.21,294,293.8,293.62,293.44,293.27,293.12,292.96,292.82,292.67,292.52,292.36,292.21,292.05,291.89,291.74,291.59,291.44,291.31,291.17,291.04,290.92,290.79,290.66,290.52,290.38,290.23,290.08,289.92,289.76,289.6,289.44,289.28,289.14,289,288.88,288.76,288.65,288.54,288.43,288.32,288.2,288.07,287.94,287.8,287.66,287.51,287.37,287.22,287.07,286.93,286.78,286.63,286.48,286.33,286.17,286.01,285.85,285.68,285.5,285.33,285.15,284.96,284.76,284.55,284.33,284.09,283.84,283.58,283.31,283.02,282.74,282.44,282.15,281.85,281.55,281.24,280.94,280.63,280.32,280.01,279.69,279.37,279.05,278.72,278.4,278.07,277.75,277.42,277.1,276.79,276.48,276.18,275.88,275.59,275.3,275.02,274.74,274.45,274.16,273.87,273.57,273.28,272.98,272.69,272.4,272.11,271.81,271.51,271.21,270.91,270.6,270.29,269.97,269.65,269.32,268.99,268.65,268.31,267.97,267.62,267.28,266.94,266.6,266.27,265.95,265.64,265.34,265.04,264.75,264.45,264.15,263.85,263.54,263.23,262.91,262.6,262.29,261.98,261.67,261.37,261.07,260.76,260.44,260.13,259.8,259.47,259.13,258.79,258.44,258.1,257.75,257.41,257.07,256.74,256.41,256.1,255.79,255.5,255.22,254.95,254.69,254.44,254.19,253.94,253.68,253.41,253.13,252.84,252.53,252.22,251.91,251.59,251.27,250.96,250.64,250.33,250.01,249.7,249.38,249.05,248.7,248.35,247.98,247.6,247.22,246.84,246.48,246.12,245.78,245.46,245.15,244.84,244.53,244.23,243.92,243.61,243.31,243,242.71,242.42,242.14,241.87,241.62,241.38,241.14,240.91,240.68,240.45,240.22,239.98,239.74,239.48,239.21,238.93,238.64,238.34,238.04,237.74,237.44,237.14,236.85,236.56,236.27,235.97,235.68,235.39,235.1,234.82,234.54,234.27,234,233.75,233.51,233.27,233.03,232.8,232.56,232.33,232.09,231.85,231.61,231.37,231.13,230.9,230.66,230.41,230.16,229.9,229.63,229.35,229.08,228.8,228.52,228.24,227.97,227.7,227.44,227.19,226.93,226.69,226.44,226.21,225.98,225.75,225.53,225.3,225.07,224.84,224.61,224.37,224.12,223.86,223.59,223.31,223.02,222.72,222.41,222.1,221.8,221.5,221.21,220.93,220.65,220.38,220.11,219.83,219.56,219.29,219.01,218.74,218.46,218.19,217.92,217.65,217.39,217.13,216.87,216.62,216.37,216.12,215.87,215.63,215.38,215.14,214.88,214.63,214.36,214.09,213.82,213.54,213.27,212.99,212.72,212.46,212.2,211.94,211.68,211.42,211.14,210.85,210.54,210.21,209.86,209.49,209.11,208.72,208.33,207.92,207.52,207.1,206.69,206.27,205.84,205.4,204.96,204.51,204.06,203.62,203.18,202.75,202.34,201.93,201.54,201.16,200.79,200.43,200.07,199.72,199.36,199.02,198.68,198.34,198.02,197.7,197.38,197.07,196.75,196.44,196.11,195.78,195.44,195.1,194.74,194.39,194.04,193.69,193.34,193.01,192.68,192.36,192.04,191.73,191.43,191.12,190.82,190.52,190.21,189.89,189.57,189.25,188.92,188.6,188.28,187.96,187.65,187.33,187.02,186.69,186.37,186.03,185.69,185.35,185,184.65,184.31,183.98,183.65,183.33,183.02,182.72,182.42,182.12,181.82,181.52,181.22,180.93,180.63,180.34,180.06,179.78,179.5,179.23,178.96,178.7,178.43,178.17,177.91,177.65,177.4,177.15,176.9,176.65,176.41,176.17,175.94,175.71,175.48,175.25,175.03,174.81,174.59,174.38,174.16,173.93,173.71,173.48,173.24,172.99,172.74,172.47,172.2,171.92,171.63,171.34,171.04,170.74,170.42,170.1,169.77,169.43,169.09,168.74,168.38,168.02,167.66,167.31,166.95,166.6,166.26,165.92,165.58,165.24,164.91,164.58,164.25,163.93,163.61,163.3,162.99,162.69,162.39,162.1,161.81,161.52,161.24,160.96,160.68,160.39,160.1,159.8,159.5,159.2,158.9,158.6,158.3,158,157.69,157.37,157.05,156.72,156.39,156.05,155.72,155.4,155.09,154.79,154.49,154.2,153.91,153.62,153.33,153.03,152.73,152.43,152.13,151.82,151.52,151.21,150.91,150.61,150.32,150.03,149.74,149.45,149.16,148.87,148.57,148.26,147.95,147.62,147.28,146.92,146.55,146.17,145.78,145.39,145,144.63,144.27,143.93,143.59,143.27,142.95,142.62,142.29,141.96,141.63,141.29,140.95,140.62,140.29,139.97,139.66,139.35,139.05,138.75,138.46,138.17,137.88,137.59,137.29,137,136.7,136.4,136.09,135.77,135.45,135.13,134.8,134.47,134.14,133.81,133.47,133.14,132.8,132.46,132.13,131.79,131.46,131.13,130.8,130.48,130.15,129.83,129.5,129.18,128.86,128.55,128.23,127.93,127.62,127.32,127.01,126.7,126.38,126.05,125.72,125.37,125.02,124.67,124.33,123.98,123.65,123.31,122.98,122.65,122.31,121.96,121.61,121.25,120.89,120.52,120.16,119.81,119.45,119.11,118.77,118.44,118.11,117.78,117.45,117.13,116.82,116.51,116.21,115.91,115.61,115.31,115.01,114.71,114.4,114.09,113.78,113.47,113.15,112.83,112.51,112.18,111.85,111.53,111.2,110.87,110.55,110.23,109.9,109.58,109.26,108.93,108.6,108.27,107.94,107.6,107.27,106.94,106.62,106.3,105.99,105.68,105.37,105.07,104.77,104.46,104.15,103.82,103.49,103.15,102.8,102.45,102.09,101.74,101.4,101.06,100.72,100.39,100.07,99.74,99.4,99.06,98.71,98.36,98.01,97.66,97.31,96.96,96.62,96.28,95.94,95.6,95.26,94.93,94.59,94.26,93.93,93.6,93.28,92.96,92.65,92.35,92.06,91.78,91.51,91.27,91.05,90.84,90.66,90.49,90.34,90.19,90.05,89.9,89.74,89.56,89.36,89.13,88.88,88.61,88.32,88.01,87.69,87.35,86.99,86.62,86.24,85.85,85.46,85.05,84.65,84.24,83.84,83.44,83.03,82.64,82.25,81.87,81.51,81.15,80.81,80.47,80.13,79.8,79.46,79.12,78.77,78.42,78.07,77.72,77.37,77.03,76.68,76.34,75.99,75.64,75.29,74.94,74.58,74.21,73.84,73.46,73.09,72.72,72.35,71.98,71.62,71.27,70.92,70.57,70.23,69.89,69.55,69.21,68.87,68.54,68.2,67.86,67.51,67.16,66.8,66.44,66.07,65.69,65.31,64.92,64.53,64.13,63.73,63.32,62.91,62.5,62.09,61.68,61.28,60.88,60.49,60.11,59.73,59.36,59.01,58.66,58.31,57.97,57.62,57.27,56.92,56.55,56.16,55.77,55.36,54.94,54.51,54.07,53.63,53.2,52.78,52.36,51.96,51.56,51.17,50.79,50.41,50.03,49.65,49.28,48.9,48.54,48.18,47.82,47.47,47.13,46.8,46.47,46.14,45.82,45.5,45.19,44.88,44.56,44.24,43.92,43.58,43.24,42.88,42.52,42.15,41.77,41.39,41,40.62,40.23,39.84,39.46,39.08,38.7,38.33,37.95,37.58,37.21,36.84,36.45,36.07,35.67,35.27,34.87,34.48,34.08,33.69,33.31,32.93,32.56,32.19,31.82,31.46,31.1,30.74,30.38,30.02,29.66,29.3,28.94,28.59,28.24,27.89,27.54,27.19,26.84,26.5,26.16,25.81,25.47,25.13,24.79,24.45,24.1,23.75,23.39,23.03,22.66,22.29,21.91,21.53,21.14,20.75,20.37,19.99,19.61,19.25,18.89,18.54,18.19,17.85,17.51,17.16,16.82,16.48,16.14,15.8,15.47,15.14,14.82,14.49,14.16,13.82,13.48,13.12,12.76,12.39,12.01,11.63,11.25,10.87,10.48,10.1,9.72,9.34,8.97,8.6,8.23,7.86,7.49,7.12,6.75,6.37,5.99,5.62,5.25,4.89,4.54,4.2,3.88,3.57,3.28,2.99,2.71,2.44,2.18,1.91,1.64,1.38,1.11,.84,.56,.28,0],elevationSource:`USGS 3DEP`},{id:`hwy-226a-diamondback-1005-395`,closed:!1,name:`NC 226A - Diamondback`,venueName:`NC 226A `,configName:`Segment 1005–395`,location:{lat:35.831234505932194,lon:-82.08266831214694},width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[484.43,815.14],[486.39,807.38],[488.34,799.61],[490.3,791.85],[492.09,784.06],[492.5,776.07],[492.5,768.07],[492.34,760.06],[491.85,752.08],[491.12,744.12],[491.25,736.11],[492.15,728.17],[493.28,720.24],[494.41,712.32],[495.78,704.43],[497.63,696.64],[499.25,688.8],[500.81,680.95],[502.37,673.1],[503.94,665.25],[505.69,657.44],[507.49,649.63],[509.29,641.83],[512.8,634.69],[518.31,628.94],[525.44,625.39],[533.35,624.3],[541.28,625.16],[549.06,627.05],[556.83,628.98],[564.53,631.14],[572.2,633.38],[579.97,635.31],[587.68,637.46],[595.39,639.63],[603.1,641.8],[610.57,644.63],[617.95,647.74],[625.06,651.33],[631.71,655.79],[638.36,660.25],[645.01,664.71],[651.66,669.16],[658.57,673.17],[665.75,676.73],[672.92,680.29],[680.09,683.85],[687.26,687.4],[694.43,690.96],[701.63,694.46],[709.02,697.54],[716.4,700.65],[723.77,703.78],[731.75,703.8],[739.18,701.19],[744.76,695.65],[747.46,688.36],[748.56,680.44],[748.01,672.52],[746.92,664.59],[744.97,656.83],[742.82,649.12],[741.76,641.23],[741.63,633.24],[742.33,625.27],[743.73,617.39],[745.84,609.68],[750.13,603],[754.87,596.55],[759.61,590.09],[765.19,584.46],[771.52,579.56],[777.84,574.65],[784.75,570.6],[791.8,566.86],[799.37,564.25],[806.94,561.65],[814.57,559.25],[822.23,556.93],[829.7,554.1],[836.41,549.79],[841.71,543.91],[844.03,536.4],[843.42,528.55],[839.9,521.47],[833.9,516.41],[826.9,512.54],[819.58,509.31],[811.94,506.95],[804.36,504.39],[796.79,501.76],[789.24,499.12],[781.85,496.05],[774.47,492.93],[767.35,489.28],[760.23,485.62],[753.1,481.97],[745.99,478.3],[739.27,473.94],[733.02,468.94],[727.27,463.37],[722.19,457.19],[718.13,450.3],[714.74,443.05],[712.42,435.4],[710.98,427.53],[710.21,419.57],[709.62,411.59],[709.03,403.6],[708.45,395.62],[707.85,387.63],[707.25,379.65],[706.65,371.67],[706.05,363.68],[705.45,355.7],[704.85,347.72],[704.29,339.73],[703.97,331.73],[703.77,323.74],[704.72,315.8],[707.19,308.23],[711.48,301.52],[717.2,295.99],[723.97,291.77],[731.35,288.7],[739.05,286.55],[746.9,285],[754.73,283.33],[762.65,283.31],[770.62,284.13],[778.34,286.05],[785.94,288.58],[793.54,291.1],[800.7,294.58],[807.6,298.63],[814.51,302.68],[821.37,306.8],[828.59,310.13],[836.2,312.64],[843.96,314.56],[851.85,315.87],[859.77,317.05],[867.69,318.23],[875.61,319.41],[883.53,320.58],[891.44,321.76],[899.36,322.94],[907.28,324.14],[915.16,325.53],[923.08,326.72],[931.03,327.2],[938.9,325.96],[946.38,323.37],[951.76,317.51],[955,310.25],[955.79,302.33],[954.44,294.48],[951.34,287.13],[947.01,280.4],[942.59,273.73],[938.16,267.06],[934.55,259.95],[933.74,252.06],[936.08,244.52],[940.63,237.98],[947.1,233.32],[954.49,230.31],[962.16,228.03],[969.64,225.26],[976.28,220.84],[981.02,214.45],[983.7,206.95],[984.64,199.03],[984.27,191.05],[983.35,183.09],[981.78,175.26],[979.75,167.52],[976.84,160.08],[972.9,153.12],[967.91,146.87],[961.93,141.55],[955.24,137.15],[948.14,133.46],[940.76,130.35],[933.39,127.24],[926.01,124.13],[918.63,121.02],[911.26,117.91],[903.99,114.55],[896.75,111.14],[889.5,107.73],[882.37,104.09],[875.29,100.36],[868.21,96.63],[861.18,92.8],[854.19,88.9],[847.2,84.99],[840.39,80.8],[833.79,76.27],[827.32,71.56],[821.02,66.62],[814.72,61.67],[808.43,56.73],[802.13,51.79],[795.5,47.34],[788.32,43.83],[780.78,41.18],[773.03,39.19],[765.21,37.46],[757.39,35.74],[749.54,34.22],[741.64,32.9],[733.74,31.59],[725.93,29.92],[718.23,27.73],[710.53,25.53],[702.83,23.34],[695.39,20.42],[688.13,17.04],[681,13.4],[673.89,9.73],[667.79,4.59],[663.15,-1.89],[660.35,-9.34],[660.18,-17.29],[662.13,-25.06],[666.44,-31.6],[672.28,-37.06],[678.98,-41.42],[686.45,-44.14],[694.37,-45.32],[702.27,-46.61],[710.15,-48.05],[718.05,-49.27],[726.04,-49.61],[734.04,-49.29],[742.04,-48.97],[749.86,-47.27],[757.68,-45.56],[765.5,-43.83],[773.31,-42.09],[781.18,-40.86],[789.19,-40.76],[797.18,-41.31],[805.13,-42.12],[812.99,-43.63],[820.85,-45.14],[828.72,-46.64],[836.58,-48.15],[844.44,-49.66],[852.3,-51.17],[860.17,-52.67],[868.03,-54.18],[875.86,-55.83],[883.65,-57.7],[891.25,-60.08],[898.35,-63.73],[904.34,-68.92],[909.07,-75.37],[912.3,-82.64],[914.27,-90.4],[915.3,-98.34],[916.32,-106.28],[917.35,-114.22],[918.37,-122.16],[919.4,-130.1],[920.36,-138.04],[921.63,-145.91],[924.58,-153.31],[928.98,-159.96],[934.5,-165.73],[941.12,-170.13],[948.58,-172.94],[956.45,-174.3],[964.45,-174.31],[972.41,-173.45],[980.2,-171.62],[987.75,-168.99],[995.02,-165.65],[1001.91,-161.59],[1008.6,-157.19],[1015.09,-152.51],[1021.39,-147.58],[1028.28,-143.55],[1035.4,-139.89],[1042.61,-136.53],[1050.55,-136.29],[1058.08,-138.73],[1064.34,-143.59],[1068.68,-150.24],[1070.57,-157.97],[1069.66,-165.88],[1066.19,-173.04],[1061.07,-179.17],[1054.91,-184.24],[1048.22,-188.63],[1041.47,-192.94],[1034.72,-197.25],[1027.97,-201.55],[1020.65,-204.61],[1012.98,-206.9],[1005.31,-209.18],[997.54,-211.1],[989.76,-212.99],[981.98,-214.88],[974.17,-216.62],[966.23,-217.41],[958.51,-219.54],[950.79,-221.67],[943.1,-223.89],[935.51,-226.42],[927.88,-228.84],[920.16,-230.96],[912.38,-232.81],[904.47,-234.01],[896.51,-234.93],[888.56,-235.07],[880.59,-234.46],[872.63,-233.87],[864.8,-232.25],[857.03,-230.31],[849.52,-227.64],[842.25,-224.28],[835.11,-220.67],[828.19,-216.68],[821.72,-211.96],[815.26,-207.23],[808.8,-202.5],[801.77,-198.71],[794.62,-195.11],[787.29,-191.9],[779.74,-189.25],[772.12,-186.8],[764.38,-184.79],[756.49,-183.51],[748.53,-182.63],[740.57,-181.75],[732.61,-180.88],[724.64,-180.14],[716.67,-179.41],[708.7,-178.67],[700.73,-177.96],[692.75,-177.25],[684.78,-176.54],[676.8,-175.88],[668.82,-175.25],[660.84,-174.62],[652.86,-173.98],[644.96,-172.71],[637.04,-171.55],[629.1,-170.51],[621.17,-169.47],[613.18,-169.47],[605.38,-171.23],[597.66,-173.31],[590.55,-176.86],[584.2,-181.73],[579.13,-187.83],[575.5,-194.94],[572.99,-202.53],[571.26,-210.35],[569.53,-218.17],[567.46,-225.88],[564.52,-233.33],[561.16,-240.58],[556.87,-247.31],[551.81,-253.51],[546.2,-259.21],[540.38,-264.7],[534.55,-270.19],[528.73,-275.69],[522.9,-281.18],[517.08,-286.67],[511.25,-292.16],[505.42,-297.64],[499.57,-303.11],[493.73,-308.59],[487.89,-314.06],[482.04,-319.53],[476.2,-325],[470.36,-330.48],[464.51,-335.95],[458.67,-341.42],[452.82,-346.89],[446.98,-352.36],[440.96,-357.64],[434.56,-362.43],[427.61,-366.4],[420.04,-368.87],[412.06,-369.4],[404.07,-368.95],[396.14,-367.9],[388.17,-367.12],[380.18,-366.67],[372.18,-366.46],[364.2,-367.14],[356.26,-368.15],[348.39,-369.54],[340.64,-371.54],[333,-373.95],[325.53,-376.82],[318.29,-380.21],[311.18,-383.88],[304.23,-387.86],[297.28,-391.84],[290.21,-395.6],[282.83,-398.65],[275.11,-400.67],[267.19,-401.84],[259.2,-402.09],[251.34,-400.68],[243.92,-397.72],[237.54,-392.98],[233.07,-386.4],[230.47,-378.85],[229.91,-370.88],[229.72,-362.88],[229.53,-354.87],[229.34,-346.87],[229.15,-338.87],[228.81,-330.87],[228.31,-322.88],[227.82,-314.89],[227.32,-306.9],[227.07,-298.9],[227.45,-290.92],[229.28,-283.15],[232.64,-275.9],[236.79,-269.06],[241.18,-262.36],[245.32,-255.51],[248.41,-248.15],[249.78,-240.29],[250.16,-232.3],[249.75,-224.3],[249.48,-216.3],[249.52,-208.3],[250,-200.31],[250.74,-192.34],[251.62,-184.38],[252.5,-176.43],[253.03,-168.44],[253.06,-160.44],[252.66,-152.45],[251.48,-144.54],[249.38,-136.82],[246.73,-129.26],[243.63,-121.88],[240.42,-114.55],[237.22,-107.21],[235.11,-99.51],[234.66,-91.54],[235.95,-83.67],[238.3,-76.03],[241.83,-68.88],[245.87,-61.97],[249.91,-55.06],[253.94,-48.15],[257.69,-41.07],[261.32,-33.94],[264.96,-26.81],[268.6,-19.67],[271.98,-12.42],[274.72,-4.92],[275.94,2.91],[274.8,10.76],[271.15,17.84],[265.58,23.54],[258.33,26.87],[250.41,27.64],[242.58,26.08],[235.11,23.3],[228.19,19.29],[221.85,14.41],[215.85,9.11],[210.26,3.39],[204.7,-2.37],[199.65,-8.59],[194.61,-14.81],[189.45,-20.92],[184.28,-27.04],[179.12,-33.15],[173.95,-39.27],[169.04,-45.59],[164.62,-52.26],[160.43,-59.08],[156.53,-66.06],[152.78,-73.14],[148.99,-80.19],[144.6,-86.88],[139.56,-93.08],[134.06,-98.87],[127.91,-103.99],[121.39,-108.62],[114.66,-112.96],[107.93,-117.3],[100.7,-120.67],[93.24,-123.57],[85.66,-126.15],[77.85,-127.88],[69.98,-129.3],[62.01,-130.02],[54.02,-130.12],[46.03,-129.67],[38.08,-128.72],[30.13,-127.77],[22.18,-126.82],[14.23,-125.86],[6.29,-124.91],[-1.66,-123.96],[-9.61,-123.01],[-17.56,-122.05],[-25.51,-121.1],[-33.46,-120.15],[-41.41,-119.17],[-49.33,-118.07],[-57.26,-116.97],[-65.19,-115.86],[-73.06,-114.39],[-80.91,-112.82],[-88.73,-111.11],[-96.52,-109.25],[-104.28,-107.29],[-111.99,-105.15],[-119.7,-103],[-127.44,-100.93],[-135.18,-98.88],[-142.92,-96.84],[-150.66,-94.8],[-158.4,-92.76],[-166.13,-90.67],[-173.86,-88.58],[-181.57,-86.44],[-189.26,-84.2],[-196.96,-82.03],[-204.68,-79.9],[-212.45,-78],[-220.32,-76.54],[-228.19,-75.08],[-236.05,-73.53],[-243.94,-72.22],[-251.89,-71.31],[-259.86,-71.76],[-267.72,-73.27],[-275.5,-75.14],[-282.73,-78.56],[-289.63,-82.6],[-295.84,-87.66],[-301.88,-92.9],[-307.29,-98.79],[-312.02,-105.22],[-315.66,-112.33],[-317.82,-119.98],[-318.35,-127.95],[-317.43,-135.87],[-315.68,-143.68],[-313.77,-151.46],[-311.86,-159.23],[-309.96,-167.01],[-308.05,-174.78],[-306.14,-182.56],[-304.23,-190.33],[-302.55,-198.16],[-300.89,-205.99],[-299.23,-213.82],[-297.96,-221.71],[-297.66,-229.7],[-298.12,-237.68],[-299.46,-245.56],[-301.76,-253.21],[-304.95,-260.54],[-308.98,-267.44],[-313.89,-273.73],[-319.49,-279.46],[-325.34,-284.92],[-331.4,-290.15],[-337.48,-295.35],[-343.56,-300.56],[-349.39,-306.05],[-354.15,-312.47],[-357.95,-319.5],[-360.07,-327.21],[-361.51,-335.07],[-362.55,-343.01],[-364.25,-350.82],[-366.86,-358.37],[-370.3,-365.57],[-375.42,-371.7],[-381.98,-376.24],[-389.5,-378.84],[-397.45,-379.11],[-404.83,-376.24],[-411.69,-372.13],[-418.46,-367.85],[-425.31,-363.71],[-432.52,-360.25],[-440,-357.4],[-447.63,-355.03],[-455.44,-353.27],[-463.32,-351.89],[-471.29,-351.21],[-479.29,-351.43],[-486.94,-353.56],[-493.33,-358.27],[-498.21,-364.59],[-501.99,-371.63],[-505.29,-378.92],[-508.56,-386.23],[-512.8,-393.01],[-518.1,-398.98],[-524.47,-403.78],[-531.56,-407.48],[-538.82,-410.84],[-546.15,-414.07],[-553.42,-417.41],[-560.61,-420.94],[-567.65,-424.74],[-574.39,-429.05],[-581.14,-433.37],[-587.85,-437.72],[-594.49,-442.19],[-601.63,-445.75],[-609.52,-446.5],[-617,-443.87],[-622.57,-438.26],[-626.28,-431.2],[-627.58,-423.35],[-627.88,-415.36],[-627.48,-407.36],[-627.08,-399.37],[-626.68,-391.37],[-626.12,-383.39],[-625.25,-375.43],[-624.37,-367.47],[-623.07,-359.58],[-621.63,-351.7],[-620.18,-343.83],[-618.92,-335.93],[-618.44,-327.94],[-618.54,-319.96],[-619.22,-311.98],[-619.9,-304],[-621.92,-296.26],[-623.98,-288.52],[-626.17,-280.82],[-628.46,-273.15],[-630.11,-265.36],[-630.01,-257.38],[-628.35,-249.58],[-624.66,-242.53],[-620.56,-235.65],[-617.65,-228.39],[-617.5,-220.44],[-620.31,-213.27],[-625.83,-207.47],[-631.96,-202.38],[-638.77,-198.18],[-645.69,-194.16],[-652.74,-190.35],[-659.78,-186.55],[-666.83,-182.75],[-673.87,-178.95],[-680.92,-175.15],[-687.92,-171.27],[-694.86,-167.28],[-701.8,-163.28],[-708.73,-159.28],[-715.49,-155.03],[-721.25,-149.5],[-725.33,-142.72],[-727.2,-134.99],[-727.09,-127.02],[-724.87,-119.37],[-720.77,-112.5],[-716.55,-105.7],[-711.92,-99.17],[-707.29,-92.64],[-700.53,-88.4],[-693.67,-84.27],[-686.94,-79.98],[-681.04,-74.56],[-675.18,-69.12],[-670.23,-62.83],[-666.12,-55.95],[-662.03,-49.07],[-658.32,-41.98],[-654.61,-34.88],[-650.9,-27.79],[-647.19,-20.7],[-643.48,-13.6],[-639.77,-6.51],[-635.75,.41],[-631.46,7.17],[-626.52,13.44],[-620.6,18.81],[-614.09,23.45],[-607.5,28.01],[-601.34,33.12],[-595.31,38.37],[-589.91,44.27],[-585.15,50.7],[-580.68,57.34],[-576.64,64.24],[-572.76,71.25],[-568.65,78.1],[-563.68,84.37],[-558.63,90.57],[-552.54,95.77],[-545.99,100.33],[-538.59,103.21],[-530.8,105.05],[-523.03,106.95],[-515.33,109.05],[-508.3,112.89],[-501.62,117.28],[-496.29,123.21],[-491.33,129.49],[-487.3,136.3],[-483.45,143.28],[-479.74,150.37],[-476.06,157.47],[-472.01,164.38],[-467.96,171.28],[-463.91,178.19],[-459.86,185.09],[-455.76,191.97],[-451.58,198.8],[-447.46,205.66],[-443.73,212.72],[-439.46,219.5],[-435.2,226.28],[-430.94,233.05],[-427.16,240.1],[-423.97,247.42],[-421.53,254.99],[-422.48,262.83],[-426.42,269.77],[-431.88,275.57],[-438.78,279.4],[-446.64,280.71],[-454.57,279.83],[-462.24,277.53],[-469.77,274.83],[-477.03,271.48],[-484.09,267.72],[-490.94,263.58],[-497.07,258.55],[-502.59,252.75],[-508.32,247.16],[-512.7,240.49],[-517.11,233.82],[-521.68,227.24],[-527.76,222.06],[-534,217.07],[-541.01,213.19],[-548.18,209.64],[-555.36,206.09],[-562.53,202.54],[-569.75,199.07],[-577.03,195.75],[-584.32,192.44],[-591.61,189.13],[-598.9,185.81],[-606.18,182.5],[-613.47,179.18],[-620.76,175.87],[-628.03,172.51],[-635.27,169.11],[-642.52,165.71],[-649.76,162.3],[-657.01,158.9],[-664.26,155.49],[-671.42,151.93],[-678.48,148.15],[-685.54,144.38],[-692.6,140.6],[-699.66,136.83],[-706.72,133.05],[-713.78,129.28],[-720.84,125.51],[-727.9,121.73],[-735.03,118.1],[-742.34,114.84],[-749.79,111.94],[-757.55,110.06],[-765.51,109.31],[-773.51,109.1],[-781.51,108.85],[-789.48,108.1],[-797.32,106.53],[-805.03,104.38],[-812.71,102.11],[-820.41,99.92],[-828.3,98.58],[-836.3,98.59],[-844.29,99.17],[-852.22,100.24],[-860.16,101.14],[-868.16,101.45],[-876.06,100.38],[-883.66,97.89],[-890.79,94.27],[-897.5,89.91],[-904.01,85.25],[-910.55,80.64],[-917.16,76.11],[-923.76,71.58],[-930.36,67.05],[-936.96,62.53],[-943.56,58],[-950.16,53.47],[-956.77,48.94],[-963.37,44.41],[-969.97,39.88],[-976.9,35.9],[-983.98,32.15],[-991.19,28.69],[-998.65,25.81],[-1006.37,23.71],[-1014.29,22.73],[-1022.29,22.57],[-1030.25,23.22],[-1038.19,24.25],[-1045.99,25.99],[-1053.52,28.67],[-1060.89,31.78],[-1068.05,35.36],[-1075.21,38.94],[-1082.42,42.43],[-1090.22,44.05],[-1098.12,45.36],[-1106.05,46.35],[-1114.03,46.59],[-1121.92,45.23],[-1129.63,43.09],[-1136.99,40.03],[-1144.15,36.43],[-1151.11,32.54],[-1157.4,27.58],[-1163.98,23.03],[-1170.58,18.5],[-1177.01,13.74],[-1183.57,9.2],[-1190.31,4.91],[-1196.84,.28],[-1203.63,-3.96],[-1210.15,-8.58],[-1216.52,-13.43],[-1222.89,-18.28],[-1229.44,-22.88],[-1236.05,-27.4],[-1242.65,-31.92],[-1248.57,-37.31],[-1254.15,-43.03],[-1259.31,-49.14],[-1264.25,-55.42],[-1268.24,-62.36],[-1272.23,-69.3],[-1276.08,-76.31],[-1279.48,-83.56],[-1282.89,-90.81],[-1285.74,-98.26],[-1288.75,-105.64],[-1292.18,-112.88],[-1295.99,-119.91],[-1300.21,-126.7],[-1305.98,-132.17],[-1312.57,-136.72],[-1319.59,-140.55],[-1327.23,-142.34],[-1335.2,-142.65],[-1343.07,-141.22],[-1350.52,-138.41],[-1357.55,-134.59],[-1363.61,-129.39],[-1368.27,-122.93],[-1371.35,-115.54],[-1374.37,-108.14],[-1373.27,-100.22],[-1371.79,-92.35],[-1369.46,-84.8],[-1365.35,-77.93],[-1361.24,-71.06],[-1357.14,-64.19],[-1353.03,-57.31],[-1348.92,-50.44],[-1345.15,-43.4],[-1342.01,-36.04],[-1340.13,-28.26],[-1338.32,-20.46],[-1337.48,-12.5],[-1337.47,-4.51],[-1338.1,3.46],[-1339.37,11.36],[-1342,18.88],[-1346.91,25.11],[-1354.28,28.09],[-1362.15,27.98],[-1369.56,24.94],[-1374.56,18.89],[-1377.33,11.39],[-1379.6,3.72],[-1381.97,-3.93],[-1385.08,-11.3],[-1388.95,-18.3],[-1394.04,-24.47],[-1399.22,-30.57],[-1404.59,-36.5],[-1410.04,-42.37],[-1415.49,-48.23],[-1420.94,-54.1],[-1426.39,-59.96],[-1431.63,-66],[-1435.66,-72.89],[-1438.54,-80.35],[-1440.55,-88.04],[-1441.32,-96],[-1440.11,-103.91],[-1438.95,-111.83],[-1437.82,-119.76],[-1436.79,-127.7],[-1435.75,-135.63],[-1435.09,-143.6],[-1434.98,-151.6],[-1435.44,-159.59],[-1436.27,-167.54],[-1437.76,-175.41]],elevation:[390.27,390,389.74,389.49,389.24,388.99,388.74,388.5,388.25,388,387.76,387.51,387.26,387.01,386.77,386.52,386.27,386.01,385.76,385.51,385.26,385.01,384.76,384.51,384.26,384.02,383.77,383.52,383.27,383.02,382.77,382.52,382.27,382.03,381.79,381.55,381.32,381.09,380.87,380.65,380.43,380.21,380,379.79,379.58,379.36,379.15,378.94,378.73,378.52,378.31,378.1,377.89,377.68,377.47,377.26,377.05,376.85,376.64,376.43,376.22,376.01,375.8,375.59,375.38,375.17,374.95,374.74,374.53,374.32,374.11,373.91,373.7,373.51,373.32,373.13,372.96,372.78,372.61,372.44,372.26,372.08,371.88,371.68,371.46,371.24,371.01,370.77,370.52,370.26,369.99,369.72,369.45,369.16,368.87,368.58,368.28,367.98,367.67,367.36,367.05,366.75,366.45,366.15,365.85,365.56,365.27,364.98,364.7,364.42,364.15,363.88,363.62,363.38,363.14,362.91,362.68,362.46,362.24,362.02,361.8,361.57,361.35,361.12,360.89,360.66,360.42,360.18,359.94,359.7,359.48,359.26,359.05,358.85,358.64,358.43,358.21,357.97,357.72,357.46,357.18,356.89,356.59,356.28,355.98,355.67,355.37,355.07,354.77,354.47,354.17,353.87,353.57,353.28,352.98,352.69,352.4,352.11,351.82,351.54,351.26,350.99,350.72,350.47,350.22,349.98,349.75,349.52,349.3,349.08,348.86,348.64,348.42,348.2,347.98,347.75,347.52,347.3,347.07,346.85,346.63,346.42,346.21,346,345.79,345.58,345.37,345.15,344.93,344.71,344.49,344.26,344.04,343.81,343.59,343.37,343.15,342.94,342.73,342.53,342.33,342.14,341.95,341.77,341.58,341.4,341.2,341,340.78,340.56,340.34,340.11,339.88,339.65,339.42,339.19,338.96,338.73,338.5,338.27,338.04,337.82,337.59,337.37,337.14,336.92,336.7,336.47,336.24,336.01,335.77,335.53,335.27,335.01,334.74,334.46,334.17,333.88,333.58,333.28,332.97,332.66,332.36,332.05,331.75,331.45,331.15,330.86,330.58,330.3,330.02,329.75,329.47,329.19,328.91,328.62,328.32,328.02,327.72,327.41,327.1,326.8,326.49,326.18,325.87,325.55,325.23,324.91,324.57,324.23,323.89,323.55,323.22,322.91,322.6,322.31,322.02,321.74,321.45,321.16,320.87,320.58,320.28,319.99,319.7,319.41,319.13,318.85,318.58,318.31,318.04,317.78,317.53,317.28,317.03,316.79,316.55,316.31,316.08,315.85,315.61,315.37,315.14,314.9,314.65,314.41,314.16,313.91,313.67,313.42,313.18,312.94,312.71,312.47,312.23,311.99,311.76,311.52,311.29,311.06,310.83,310.61,310.38,310.16,309.94,309.72,309.5,309.27,309.04,308.8,308.55,308.3,308.04,307.78,307.52,307.25,306.99,306.72,306.46,306.2,305.94,305.67,305.41,305.15,304.89,304.62,304.35,304.07,303.78,303.49,303.2,302.89,302.59,302.29,302,301.72,301.45,301.19,300.94,300.7,300.46,300.22,299.98,299.73,299.48,299.22,298.96,298.69,298.41,298.13,297.85,297.57,297.29,297.02,296.75,296.48,296.22,295.97,295.71,295.46,295.21,294.97,294.72,294.48,294.23,293.98,293.73,293.48,293.24,293,292.76,292.52,292.29,292.05,291.81,291.57,291.32,291.08,290.83,290.58,290.34,290.1,289.86,289.62,289.39,289.15,288.92,288.67,288.43,288.18,287.93,287.68,287.42,287.17,286.92,286.66,286.4,286.15,285.89,285.63,285.38,285.13,284.88,284.64,284.41,284.18,283.95,283.72,283.5,283.27,283.03,282.8,282.55,282.31,282.06,281.8,281.54,281.28,281.02,280.75,280.48,280.21,279.94,279.67,279.4,279.13,278.85,278.57,278.29,278.01,277.73,277.45,277.16,276.86,276.56,276.25,275.93,275.61,275.27,274.93,274.59,274.24,273.9,273.57,273.24,272.92,272.58,272.24,271.87,271.49,271.08,270.67,270.24,269.81,269.39,268.98,268.57,268.17,267.77,267.37,266.97,266.58,266.19,265.8,265.41,265.03,264.65,264.26,263.88,263.5,263.11,262.73,262.34,261.96,261.57,261.17,260.78,260.38,259.99,259.59,259.19,258.79,258.39,257.98,257.58,257.17,256.76,256.36,255.96,255.57,255.19,254.81,254.43,254.05,253.67,253.29,252.9,252.51,252.11,251.73,251.35,250.98,250.63,250.3,249.98,249.68,249.41,249.15,248.91,248.69,248.48,248.29,248.1,247.92,247.74,247.56,247.38,247.2,247.02,246.84,246.66,246.48,246.3,246.11,245.93,245.73,245.53,245.31,245.08,244.84,244.58,244.3,244,243.68,243.35,243,242.65,242.28,241.91,241.53,241.15,240.76,240.37,239.98,239.58,239.18,238.78,238.38,237.98,237.59,237.2,236.81,236.42,236.03,235.66,235.29,234.93,234.58,234.24,233.91,233.6,233.3,233.01,232.72,232.45,232.19,231.93,231.68,231.43,231.19,230.95,230.71,230.47,230.23,230,229.76,229.53,229.3,229.07,228.84,228.61,228.38,228.14,227.9,227.67,227.42,227.18,226.94,226.7,226.47,226.23,226,225.77,225.54,225.32,225.09,224.86,224.63,224.4,224.16,223.92,223.67,223.42,223.16,222.89,222.63,222.36,222.09,221.82,221.55,221.29,221.03,220.77,220.51,220.24,219.97,219.69,219.42,219.15,218.88,218.61,218.34,218.08,217.81,217.54,217.28,217.01,216.76,216.51,216.27,216.03,215.8,215.57,215.35,215.13,214.91,214.7,214.49,214.28,214.07,213.86,213.65,213.44,213.23,213.01,212.79,212.56,212.32,212.09,211.85,211.61,211.38,211.15,210.91,210.68,210.45,210.21,209.97,209.72,209.47,209.21,208.94,208.67,208.39,208.11,207.84,207.57,207.31,207.06,206.82,206.59,206.36,206.13,205.9,205.68,205.45,205.22,204.99,204.76,204.53,204.3,204.07,203.83,203.6,203.36,203.12,202.88,202.63,202.39,202.14,201.9,201.66,201.43,201.2,200.99,200.77,200.56,200.35,200.13,199.92,199.69,199.47,199.24,199,198.77,198.54,198.3,198.07,197.84,197.62,197.4,197.18,196.97,196.76,196.55,196.34,196.12,195.9,195.68,195.45,195.22,194.98,194.73,194.47,194.2,193.92,193.63,193.33,193.01,192.69,192.35,192.01,191.66,191.31,190.97,190.63,190.29,189.97,189.65,189.34,189.05,188.76,188.49,188.23,187.98,187.75,187.53,187.32,187.11,186.92,186.72,186.53,186.35,186.17,186,185.83,185.68,185.52,185.37,185.22,185.06,184.9,184.73,184.55,184.36,184.16,183.95,183.73,183.5,183.26,183,182.73,182.46,182.17,181.87,181.57,181.26,180.96,180.65,180.35,180.05,179.74,179.44,179.13,178.82,178.5,178.18,177.87,177.55,177.24,176.94,176.64,176.36,176.08,175.81,175.55,175.31,175.07,174.84,174.62,174.4,174.18,173.97,173.76,173.54,173.33,173.11,172.9,172.69,172.48,172.27,172.07,171.87,171.67,171.48,171.29,171.09,170.89,170.69,170.48,170.27,170.05,169.82,169.59,169.37,169.14,168.92,168.7,168.49,168.27,168.06,167.85,167.63,167.41,167.19,166.96,166.72,166.47,166.19,165.91,165.6,165.28,164.94,164.6,164.26,163.92,163.58,163.24,162.9,162.55,162.21,161.86,161.52,161.19,160.86,160.54,160.24,159.93,159.64,159.34,159.05,158.78,158.51,158.25,158.01,157.77,157.54,157.31,157.09,156.86,156.63,156.4,156.16,155.92,155.68,155.43,155.17,154.92,154.66,154.41,154.15,153.9,153.66,153.42,153.18,152.94,152.71,152.48,152.24,152.01,151.76,151.51,151.25,150.99,150.71,150.44,150.17,149.9,149.64,149.38,149.13,148.88,148.63,148.37,148.11,147.86,147.6,147.35,147.09,146.84,146.59,146.34,146.09,145.85,145.6,145.36,145.12,144.87,144.63,144.39,144.15,143.9,143.65,143.39,143.12,142.85,142.57,142.3,142.02,141.74,141.47,141.21,140.94,140.68,140.42,140.16,139.9,139.64,139.37,139.11,138.83,138.56,138.28,138.01,137.75,137.49,137.25,137.01,136.77,136.54,136.32,136.09,135.87,135.64,135.41,135.17,134.93,134.68,134.43,134.18,133.93,133.68,133.43,133.18,132.93,132.69,132.44,132.2,131.96,131.71,131.46,131.21,130.95,130.68,130.4,130.12,129.83,129.53,129.24,128.95,128.66,128.37,128.09,127.81,127.54,127.28,127.03,126.78,126.54,126.31,126.08,125.85,125.62,125.39,125.15,124.91,124.68,124.45,124.23,124.01,123.8,123.59,123.38,123.17,122.96,122.76,122.55,122.35,122.16,121.97,121.78,121.6,121.41,121.23,121.03,120.83,120.62,120.41,120.19,119.96,119.73,119.48,119.23,118.98,118.73,118.49,118.25,118.01,117.77,117.52,117.27,117.01,116.73,116.46,116.17,115.89,115.61,115.33,115.06,114.8,114.53,114.28,114.02,113.76,113.51,113.26,113,112.75,112.51,112.27,112.03,111.81,111.58,111.36,111.14,110.92,110.71,110.49,110.27,110.06,109.84,109.61,109.38,109.14,108.89,108.63,108.36,108.09,107.82,107.55,107.29,107.06,106.83,106.62,106.42,106.22,106.02,105.81,105.59,105.37,105.13,104.9,104.67,104.44,104.21,103.99,103.77,103.55,103.34,103.12,102.89,102.65,102.4,102.14,101.88,101.62,101.36,101.1,100.85,100.61,100.38,100.15,99.92,99.69,99.46,99.22,98.97,98.71,98.43,98.15,97.86,97.56,97.25,96.92,96.58,96.23,95.86,95.5,95.13,94.77,94.41,94.06,93.71,93.37,93.03,92.69,92.34,92,91.64,91.28,90.9,90.53,90.14,89.76,89.37,88.97,88.58,88.18,87.78,87.39,87.01,86.63,86.26,85.89,85.52,85.14,84.76,84.38,83.99,83.6,83.21,82.83,82.45,82.09,81.74,81.39,81.07,80.75,80.45,80.16,79.89,79.63,79.39,79.15,78.93,78.71,78.5,78.3,78.1,77.91,77.71,77.51,77.31,77.09,76.87,76.63,76.38,76.12,75.86,75.59,75.31,75.02,74.71,74.39,74.06,73.71,73.35,72.99,72.61,72.24,71.87,71.52,71.18,70.85,70.53,70.21,69.9,69.58,69.26,68.94,68.61,68.28,67.95,67.62,67.3,66.98,66.67,66.37,66.08,65.81,65.55,65.32,65.11,64.92,64.75,64.59,64.43,64.28,64.12,63.96,63.78,63.59,63.4,63.2,63.01,62.82,62.64,62.47,62.3,62.14,61.98,61.81,61.64,61.47,61.27,61.07,60.85,60.61,60.37,60.11,59.85,59.6,59.35,59.11,58.88,58.65,58.43,58.22,58,57.78,57.56,57.34,57.11,56.88,56.65,56.42,56.19,55.96,55.73,55.5,55.28,55.06,54.84,54.62,54.4,54.18,53.96,53.74,53.53,53.32,53.11,52.91,52.71,52.52,52.33,52.15,51.98,51.81,51.66,51.5,51.35,51.21,51.07,50.94,50.81,50.68,50.55,50.42,50.29,50.14,49.98,49.81,49.63,49.42,49.2,48.96,48.7,48.42,48.11,47.78,47.43,47.07,46.7,46.33,45.95,45.58,45.2,44.83,44.46,44.08,43.7,43.3,42.9,42.49,42.07,41.65,41.22,40.81,40.39,39.99,39.59,39.19,38.79,38.4,38.01,37.62,37.23,36.84,36.44,36.05,35.66,35.26,34.86,34.45,34.04,33.63,33.21,32.78,32.36,31.93,31.52,31.11,30.72,30.33,29.95,29.58,29.2,28.82,28.44,28.05,27.65,27.25,26.85,26.45,26.04,25.63,25.22,24.81,24.4,23.99,23.58,23.18,22.77,22.37,21.97,21.57,21.18,20.81,20.44,20.09,19.75,19.42,19.1,18.79,18.49,18.2,17.93,17.67,17.42,17.19,16.97,16.76,16.56,16.37,16.19,16.02,15.85,15.68,15.52,15.34,15.16,14.98,14.78,14.58,14.37,14.16,13.95,13.74,13.54,13.34,13.14,12.96,12.78,12.6,12.44,12.27,12.1,11.93,11.75,11.57,11.38,11.18,10.98,10.78,10.59,10.41,10.25,10.1,9.95,9.81,9.66,9.51,9.35,9.18,9,8.82,8.63,8.44,8.25,8.06,7.86,7.66,7.46,7.26,7.04,6.82,6.59,6.35,6.1,5.84,5.57,5.3,5.03,4.75,4.48,4.2,3.93,3.66,3.4,3.14,2.88,2.62,2.37,2.11,1.86,1.62,1.38,1.14,.91,.68,.45,.23,0],elevationSource:`USGS 3DEP`},{id:`road-3ae9d056-333e-46d4-80ee-931586dcc6d4`,closed:!1,name:`Malibu Canyon Road`,width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[347.04,2409.79],[349.84,2402.29],[352.64,2394.78],[355.43,2387.28],[358.23,2379.78],[361.03,2372.28],[363.47,2364.65],[365.9,2357.02],[368.33,2349.39],[370.76,2341.76],[373.19,2334.13],[375.62,2326.5],[378.05,2318.87],[380.48,2311.24],[382.91,2303.61],[385.34,2295.98],[387.77,2288.35],[390.74,2280.96],[394.61,2273.94],[398.47,2266.93],[402.33,2259.91],[406.19,2252.9],[410.06,2245.89],[414.05,2238.96],[419.12,2232.76],[424.18,2226.56],[429.25,2220.36],[434.31,2214.16],[439.67,2208.23],[445.6,2202.84],[451.52,2197.46],[457.45,2192.08],[463.38,2186.7],[469.31,2181.32],[474.83,2175.52],[480.31,2169.68],[485.79,2163.84],[491.26,2158],[496.74,2152.16],[502.06,2146.18],[507.23,2140.06],[512.39,2133.94],[516.73,2127.21],[520.98,2120.43],[525.24,2113.65],[529.14,2106.66],[532.93,2099.6],[536.72,2092.55],[540.51,2085.5],[544.3,2078.45],[548.16,2071.43],[552.34,2064.6],[556.51,2057.77],[560.68,2050.93],[564.86,2044.1],[569.03,2037.27],[573.21,2030.43],[577.38,2023.6],[581.55,2016.76],[585.73,2009.93],[589.69,2002.97],[593.56,1995.96],[597.42,1988.95],[601.29,1981.94],[605.16,1974.93],[609.03,1967.92],[612.9,1960.91],[616.77,1953.9],[620.41,1946.77],[623.84,1939.53],[627.27,1932.3],[630.7,1925.07],[634.14,1917.83],[637.46,1910.55],[640.35,1903.08],[643.23,1895.61],[646.12,1888.14],[649.01,1880.68],[651.9,1873.21],[654.79,1865.74],[657.68,1858.27],[660.56,1850.8],[663.45,1843.34],[666.45,1835.91],[669.74,1828.61],[673.03,1821.31],[676.32,1814.01],[679.61,1806.71],[682.9,1799.41],[686.19,1792.11],[689.48,1784.81],[693.31,1777.79],[697.32,1770.85],[701.32,1763.92],[705.32,1756.99],[709.33,1750.05],[713.33,1743.12],[717.34,1736.18],[721.34,1729.25],[725.34,1722.31],[729.68,1715.58],[734.01,1708.85],[738.35,1702.11],[742.68,1695.38],[747.01,1688.65],[751.35,1681.92],[755.68,1675.18],[760.02,1668.45],[764.35,1661.72],[768.68,1654.98],[773.02,1648.25],[777.35,1641.52],[781.69,1634.78],[786.02,1628.05],[790.35,1621.32],[794.69,1614.59],[799.02,1607.85],[803.36,1601.12],[807.69,1594.39],[812.03,1587.65],[816.36,1580.92],[820.17,1573.89],[823.85,1566.77],[827.19,1559.5],[830.42,1552.17],[833.66,1544.85],[836.15,1537.24],[838.52,1529.6],[840.9,1521.95],[842.5,1514.11],[844.07,1506.25],[845.5,1498.38],[846.09,1490.4],[846.68,1482.41],[847.27,1474.43],[847.86,1466.44],[848.45,1458.46],[849.04,1450.47],[849.63,1442.48],[850.22,1434.5],[850.8,1426.51],[851.39,1418.53],[851.98,1410.54],[852.57,1402.56],[853.16,1394.57],[853.75,1386.58],[854.34,1378.6],[854.93,1370.61],[855.51,1362.63],[856.1,1354.64],[856.69,1346.66],[857.97,1338.76],[859.4,1330.88],[860.82,1323],[862.24,1315.12],[863.67,1307.24],[865.09,1299.36],[866.51,1291.48],[867.94,1283.6],[869.36,1275.72],[870.78,1267.84],[872.2,1259.96],[873.63,1252.08],[875.05,1244.2],[876.23,1236.29],[876.79,1228.3],[877.35,1220.31],[877.92,1212.33],[878.48,1204.34],[879,1196.35],[878.08,1188.4],[877.15,1180.45],[875.88,1172.56],[873.97,1164.78],[872.06,1157],[870.15,1149.22],[866.55,1142.08],[862.92,1134.94],[859.3,1127.8],[855.68,1120.65],[851.93,1113.58],[847.74,1106.76],[843.55,1099.94],[839.36,1093.12],[835.16,1086.29],[830.97,1079.47],[826.69,1072.71],[822.06,1066.18],[817.43,1059.65],[812.79,1053.11],[808.16,1046.58],[803.53,1040.05],[798.9,1033.52],[794.27,1026.99],[789.63,1020.46],[785,1013.92],[780.37,1007.39],[775.74,1000.86],[771.11,994.33],[765.12,989.15],[758.6,984.5],[752.08,979.84],[745.57,975.19],[738.3,971.82],[731.04,968.45],[723.78,965.08],[716.49,961.77],[709.09,958.71],[701.69,955.65],[694.29,952.59],[686.89,949.53],[679.55,946.35],[672.48,942.59],[665.41,938.83],[658.34,935.07],[651.62,930.71],[644.95,926.29],[638.27,921.86],[631.6,917.44],[624.92,913.02],[618.25,908.6],[610.97,905.34],[603.5,902.47],[595.94,899.94],[587.98,899.04],[580.03,898.13],[572.09,898.17],[564.18,899.4],[556.26,900.63],[548.51,902.57],[540.86,904.92],[533.2,907.26],[525.55,909.61],[517.79,911.56],[509.97,913.28],[502.15,915],[494.27,916.38],[486.32,917.39],[478.38,918.39],[470.44,919.4],[462.49,920.4],[454.55,921.41],[446.6,922.41],[438.66,923.42],[430.72,924.42],[422.77,925.43],[414.9,926.71],[407.47,929.69],[400.03,932.66],[392.6,935.64],[385.16,938.61],[377.73,941.58],[370.29,944.56],[362.76,947.26],[355.13,949.68],[347.49,952.1],[339.57,953.08],[331.6,953.79],[323.62,954.5],[315.69,954.36],[307.85,952.76],[300,951.17],[292.15,949.58],[284.4,947.62],[276.85,944.98],[269.29,942.33],[261.73,939.69],[254.07,937.38],[246.28,935.55],[238.48,933.71],[230.69,931.88],[222.88,930.11],[214.97,928.89],[207.05,927.68],[199.14,926.46],[191.19,925.51],[183.23,924.61],[175.28,923.7],[167.32,922.8],[159.36,921.9],[151.61,920.18],[144.18,917.2],[136.74,914.23],[129.54,910.75],[122.42,907.09],[115.3,903.43],[108.18,899.77],[101.06,896.1],[93.93,892.44],[86.81,888.78],[79.49,885.6],[71.91,883.02],[64.33,880.44],[56.59,878.63],[48.61,878.04],[40.62,877.46],[32.63,877.82],[24.64,878.35],[16.68,879.02],[9.17,881.8],[1.66,884.57],[-5.86,887.34],[-13.37,890.11],[-20.88,892.88],[-28.39,895.65],[-35.91,898.43],[-43.42,901.2],[-50.93,903.97],[-58.44,906.74],[-65.95,909.51],[-73.47,912.28],[-80.98,915.06],[-88.49,917.83],[-96,920.6],[-103.52,923.37],[-111.03,926.14],[-118.61,928.66],[-126.44,930.35],[-134.27,932.03],[-142.1,933.72],[-149.95,935.17],[-157.96,935.06],[-165.96,934.94],[-173.97,934.83],[-181.98,934.72],[-189.85,933.44],[-197.68,931.77],[-205.51,930.1],[-213.34,928.43],[-221.16,926.72],[-228.19,922.88],[-235.21,919.03],[-242.23,915.18],[-249.25,911.33],[-256.27,907.49],[-262.91,903],[-269.48,898.44],[-276.06,893.87],[-282.63,889.3],[-289.21,884.73],[-295.79,880.16],[-302.36,875.59],[-308.94,871.02],[-315.51,866.45],[-322.09,861.89],[-328.67,857.32],[-335.01,852.46],[-340.82,846.95],[-346.63,841.44],[-352.44,835.93],[-357.73,829.92],[-363.01,823.9],[-368.29,817.88],[-373.31,811.65],[-378.16,805.28],[-383.01,798.91],[-387.86,792.53],[-392.71,786.16],[-397.31,779.62],[-401.56,772.83],[-405.81,766.05],[-410.06,759.26],[-414.31,752.48],[-418.57,745.69],[-422.42,738.67],[-426.25,731.64],[-430.09,724.61],[-433.75,717.52],[-435.83,709.78],[-437.9,702.05],[-439.97,694.31],[-442.05,686.58],[-444.12,678.85],[-446.19,671.11],[-447.06,663.16],[-447.78,655.19],[-448.38,647.21],[-448.38,639.2],[-448.38,631.19],[-448.29,623.19],[-447.62,615.21],[-446.96,607.23],[-446.29,599.25],[-445.63,591.27],[-444.53,583.34],[-443.24,575.44],[-441.94,567.54],[-440.65,559.64],[-439.36,551.73],[-438.06,543.83],[-436.77,535.93],[-435.65,528],[-434.57,520.07],[-433.49,512.13],[-432.41,504.2],[-431.34,496.26],[-430.26,488.33],[-429.6,480.37],[-429.6,472.36],[-429.6,464.35],[-429.6,456.34],[-429.6,448.34],[-430.07,440.35],[-430.88,432.39],[-431.69,424.42],[-432.49,416.45],[-433.3,408.49],[-434.53,400.58],[-435.96,392.7],[-437.39,384.82],[-438.81,376.94],[-440.24,369.06],[-441.67,361.19],[-443.1,353.31],[-444.53,345.43],[-445.96,337.55],[-447.39,329.67],[-448.81,321.79],[-450.24,313.91],[-451.67,306.03],[-453.1,298.15],[-454.53,290.28],[-455.96,282.4],[-457.39,274.52],[-458.81,266.64],[-460.24,258.76],[-461.67,250.88],[-463.1,243],[-464.53,235.12],[-465.46,227.18],[-465.97,219.19],[-466.48,211.2],[-466.67,203.2],[-466.56,195.2],[-465.28,187.3],[-463.87,179.42],[-461.71,171.71],[-459.54,164],[-457.38,156.29],[-454.49,148.87],[-450.86,141.73],[-447.23,134.59],[-443.6,127.45],[-439.54,120.61],[-434.33,114.53],[-429.12,108.45],[-423.74,102.52],[-418.14,96.79],[-412.55,91.07],[-406.95,85.34],[-400.81,80.23],[-394.36,75.49],[-387.91,70.75],[-381.46,66],[-375.01,61.26],[-368.56,56.52],[-362.11,51.77],[-355.66,47.03],[-349.01,42.57],[-342.31,38.18],[-335.62,33.78],[-328.93,29.38],[-322.23,24.99],[-316.15,19.8],[-310.16,14.48],[-304.17,9.17],[-298.28,3.76],[-292.69,-1.98],[-287.11,-7.72],[-281.53,-13.46],[-275.94,-19.2],[-270.36,-24.94],[-264.78,-30.68],[-260.69,-37.56],[-256.68,-44.49],[-252.66,-51.41],[-248.9,-58.47],[-245.53,-65.74],[-242.17,-73.01],[-238.81,-80.27],[-236.43,-87.89],[-234.45,-95.65],[-232.47,-103.41],[-230.49,-111.17],[-228.51,-118.93],[-226.53,-126.68],[-225.83,-134.62],[-225.61,-142.63],[-225.38,-150.63],[-225.15,-158.63],[-225.48,-166.6],[-226.83,-174.49],[-228.19,-182.38],[-229.55,-190.27],[-230.91,-198.16],[-232.27,-206.06],[-234.38,-213.74],[-237.18,-221.25],[-239.98,-228.75],[-242.78,-236.25],[-245.58,-243.75],[-249.09,-250.92],[-253.11,-257.84],[-257.13,-264.77],[-261.15,-271.69],[-265.31,-278.52],[-270.26,-284.82],[-275.2,-291.12],[-280.14,-297.42],[-285.26,-303.55],[-291.33,-308.77],[-297.4,-313.99],[-303.48,-319.21],[-309.55,-324.43],[-315.62,-329.65],[-322.08,-334.38],[-328.56,-339.08],[-335.04,-343.79],[-341.52,-348.49],[-348,-353.2],[-354.43,-357.97],[-360.77,-362.86],[-367.11,-367.74],[-373.46,-372.63],[-379.8,-377.51],[-386.15,-382.4],[-392.49,-387.28],[-398.84,-392.17],[-404.74,-397.55],[-410.35,-403.27],[-415.95,-408.99],[-421.55,-414.71],[-426.87,-420.68],[-431.66,-427.09],[-436.45,-433.51],[-441.24,-439.92],[-446.03,-446.34],[-450.82,-452.76],[-454.94,-459.59],[-458.59,-466.72],[-462.23,-473.85],[-465.87,-480.98],[-469.51,-488.11],[-473.15,-495.24],[-476.8,-502.37],[-480.44,-509.51],[-484.08,-516.64],[-487.72,-523.77],[-491.36,-530.9],[-495,-538.03],[-498.65,-545.16],[-502.29,-552.29],[-505.93,-559.42],[-509.57,-566.56],[-513.13,-573.73],[-516.57,-580.96],[-520.01,-588.19],[-523.45,-595.42],[-526.89,-602.65],[-530.33,-609.88],[-533.77,-617.11],[-537.21,-624.34],[-540.65,-631.57],[-544.09,-638.8],[-547.53,-646.04],[-550.97,-653.27],[-554.41,-660.5],[-557.85,-667.73],[-561.29,-674.96],[-564.73,-682.19],[-568.17,-689.42],[-571.61,-696.65],[-575.04,-703.89],[-578.14,-711.27],[-581.25,-718.65],[-584.36,-726.03],[-587.46,-733.41],[-590.57,-740.79],[-593.67,-748.17],[-596.78,-755.55],[-599.88,-762.93],[-602.99,-770.31],[-606.1,-777.69],[-609.2,-785.07],[-612.31,-792.45],[-615.41,-799.83],[-618.52,-807.21],[-621.63,-814.59],[-624.73,-821.97],[-627.84,-829.35],[-630.63,-836.86],[-633.29,-844.41],[-635.95,-851.96],[-638.61,-859.51],[-641.27,-867.07],[-643.93,-874.62],[-645.27,-882.51],[-646.54,-890.41],[-647.8,-898.32],[-649.06,-906.23],[-650.32,-914.13],[-651.48,-922.05],[-651.26,-930.05],[-651.03,-938.06],[-650.81,-946.06],[-650.59,-954.07],[-650.36,-962.07],[-650.14,-970.07],[-649.54,-978.05],[-648.51,-985.99],[-647.48,-993.93],[-646.46,-1001.87],[-645.43,-1009.81],[-644.4,-1017.75],[-643.37,-1025.69],[-641.94,-1033.57],[-640.37,-1041.42],[-638.65,-1049.24],[-636.81,-1057.03],[-634.89,-1064.8],[-632.45,-1072.43],[-630.02,-1080.06],[-627.58,-1087.69],[-625.14,-1095.31],[-622.88,-1102.99],[-620.82,-1110.73],[-618.77,-1118.47],[-616.71,-1126.21],[-614.65,-1133.95],[-612.75,-1141.72],[-611.06,-1149.55],[-609.37,-1157.38],[-607.68,-1165.2],[-605.99,-1173.03],[-604.3,-1180.86],[-601.99,-1188.52],[-599.58,-1196.16],[-597.83,-1203.93],[-597.08,-1211.9],[-596.7,-1219.89],[-596.83,-1227.89],[-596.96,-1235.9],[-597.1,-1243.9],[-597.78,-1251.87],[-598.69,-1259.83],[-599.6,-1267.79],[-600.51,-1275.74],[-601.43,-1283.7],[-602.34,-1291.65],[-603.25,-1299.61],[-604.16,-1307.56],[-604.73,-1315.54],[-605.05,-1323.54],[-605.37,-1331.55],[-605.68,-1339.55],[-605.96,-1347.55],[-605.51,-1355.53],[-604.82,-1363.51],[-604.12,-1371.49],[-606.03,-1379.21],[-604.03,-1386.96],[-601.14,-1394.42],[-598.24,-1401.89],[-595.35,-1409.35],[-591.51,-1416.37],[-587.6,-1423.37],[-583.05,-1429.91],[-577.92,-1436.06],[-572.59,-1442.03],[-567.12,-1447.88],[-561.65,-1453.73],[-555.49,-1458.84],[-549.25,-1463.85],[-542.61,-1468.33],[-535.97,-1472.8],[-529.33,-1477.28],[-522.21,-1480.89],[-514.91,-1484.17],[-507.36,-1486.81],[-499.7,-1489.12],[-491.82,-1490.54],[-483.94,-1491.96],[-476.06,-1493.38],[-468.18,-1494.81],[-460.3,-1496.23],[-452.42,-1497.65],[-444.54,-1499.07],[-436.66,-1500.49],[-428.81,-1502.08],[-420.97,-1503.71],[-413.13,-1505.34],[-405.29,-1506.97],[-397.45,-1508.6],[-389.61,-1510.23],[-381.87,-1512.23],[-374.26,-1514.71],[-366.64,-1517.19],[-359.03,-1519.66],[-351.41,-1522.14],[-343.8,-1524.62],[-336.45,-1527.79],[-329.15,-1531.07],[-321.85,-1534.36],[-314.55,-1537.64],[-307.39,-1541.23],[-300.27,-1544.9],[-293.15,-1548.56],[-286.03,-1552.23],[-278.92,-1555.91],[-271.83,-1559.63],[-264.73,-1563.34],[-257.64,-1567.06],[-250.55,-1570.77],[-243.46,-1574.49],[-236.36,-1578.21],[-229.27,-1581.92],[-222.18,-1585.64],[-215.08,-1589.35],[-207.99,-1593.07],[-200.9,-1596.79],[-193.81,-1600.5],[-186.71,-1604.22],[-179.62,-1607.93],[-172.5,-1611.6],[-165.37,-1615.24],[-158.24,-1618.88],[-151.1,-1622.51],[-143.97,-1626.15],[-136.83,-1629.78],[-129.7,-1633.42],[-122.57,-1637.06],[-115.43,-1640.69],[-108.3,-1644.33],[-101.16,-1647.97],[-94.03,-1651.6],[-86.89,-1655.24],[-79.76,-1658.87],[-72.56,-1662.35],[-64.99,-1664.97],[-57.43,-1667.6],[-49.86,-1670.23],[-42.3,-1672.85],[-34.73,-1675.48],[-27.17,-1678.1],[-19.61,-1680.73],[-11.99,-1683.17],[-4.21,-1685.06],[3.57,-1686.96],[11.35,-1688.86],[19.13,-1690.75],[26.91,-1692.65],[34.69,-1694.54],[42.47,-1696.44],[50.25,-1698.34],[58.03,-1700.23],[65.81,-1702.13],[73.59,-1704.02],[81.37,-1705.92],[89.04,-1708.2],[96.68,-1710.62],[104.31,-1713.03],[111.94,-1715.45],[119.58,-1717.86],[127.21,-1720.28],[134.68,-1723.13],[141.88,-1726.63],[149.08,-1730.13],[156.28,-1733.63],[163.48,-1737.13],[170.68,-1740.63],[177.89,-1744.13],[185.09,-1747.63],[192.29,-1751.13],[199.49,-1754.63],[206.55,-1758.4],[213.54,-1762.31],[220.53,-1766.22],[227.52,-1770.13],[234.5,-1774.04],[241.49,-1777.95],[248.48,-1781.86],[255.46,-1785.77],[261.44,-1791.08],[267.14,-1796.71],[272.83,-1802.34],[278.52,-1807.97],[284.22,-1813.6],[289.91,-1819.24],[295.6,-1824.87],[301.29,-1830.5],[306.81,-1836.29],[311.91,-1842.46],[317.01,-1848.64],[322.11,-1854.81],[327.15,-1861.03],[331.77,-1867.57],[336.4,-1874.1],[341,-1880.65],[345.19,-1887.48],[349.38,-1894.3],[353.57,-1901.13],[357.75,-1907.95],[361.94,-1914.78],[366.13,-1921.6],[370.03,-1928.59],[373.79,-1935.66],[377.34,-1942.84],[380.62,-1950.14],[383.9,-1957.45],[387.1,-1964.78],[389.68,-1972.36],[392.26,-1979.94],[394.96,-1987.46],[400.04,-1993.64],[402.99,-2000.9],[404.97,-2008.66],[406.95,-2016.42],[408.59,-2024.25],[409.79,-2032.17],[411,-2040.08],[412,-2048.03],[412.85,-2055.99],[413.71,-2063.95],[414.51,-2071.91],[414.78,-2079.92],[415.06,-2087.92],[415.34,-2095.92],[415.31,-2103.92],[414.99,-2111.93],[414.67,-2119.93],[414.35,-2127.93],[414.03,-2135.93],[413.29,-2143.9],[412.49,-2151.87],[411.69,-2159.83],[410.89,-2167.8],[410.09,-2175.77],[409.3,-2183.74],[408.5,-2191.7],[407.7,-2199.67],[406.9,-2207.64],[406.1,-2215.61]],elevation:[86.66,86.38,86.1,85.82,85.53,85.24,84.95,84.66,84.36,84.07,83.77,83.49,83.21,82.94,82.69,82.46,82.24,82.04,81.85,81.69,81.54,81.4,81.29,81.19,81.11,81.04,80.99,80.95,80.92,80.91,80.91,80.93,80.97,81.02,81.08,81.15,81.23,81.3,81.38,81.45,81.53,81.61,81.69,81.77,81.85,81.91,81.97,82.01,82.03,82.04,82.03,82.01,81.98,81.95,81.9,81.84,81.78,81.7,81.62,81.53,81.43,81.33,81.22,81.11,80.99,80.87,80.75,80.63,80.5,80.37,80.24,80.1,79.96,79.82,79.67,79.52,79.36,79.2,79.03,78.86,78.69,78.52,78.34,78.17,78,77.83,77.66,77.49,77.33,77.16,77,76.84,76.68,76.53,76.37,76.21,76.06,75.9,75.74,75.59,75.43,75.28,75.12,74.97,74.81,74.66,74.51,74.36,74.23,74.1,73.98,73.87,73.76,73.68,73.6,73.53,73.48,73.45,73.43,73.44,73.46,73.51,73.59,73.68,73.8,73.94,74.1,74.27,74.46,74.67,74.89,75.13,75.37,75.64,75.91,76.19,76.48,76.77,77.07,77.36,77.65,77.93,78.2,78.44,78.67,78.87,79.05,79.21,79.35,79.47,79.58,79.7,79.87,80.12,80.56,81.31,82.54,84.42,87.09,90.61,94.95,99.97,105.45,111.12,116.67,121.81,126.27,129.85,132.48,134.24,135.32,136.02,136.63,137.36,138.34,139.53,140.77,141.83,142.38,142.16,140.93,138.61,135.24,130.97,126.03,120.66,115.09,109.53,104.13,99.06,94.46,90.45,87.1,84.47,82.51,81.16,80.3,79.79,79.52,79.4,79.35,79.34,79.34,79.34,79.33,79.3,79.26,79.2,79.11,79,78.87,78.72,78.54,78.34,78.12,77.89,77.65,77.41,77.16,76.92,76.68,76.43,76.19,75.95,75.7,75.45,75.2,74.94,74.68,74.42,74.14,73.86,73.58,73.28,72.97,72.64,72.31,71.97,71.63,71.28,70.94,70.59,70.24,69.89,69.53,69.17,68.82,68.46,68.1,67.74,67.38,67.03,66.67,66.32,65.96,65.6,65.24,64.88,64.52,64.15,63.78,63.41,63.04,62.66,62.3,61.93,61.58,61.24,60.91,60.58,60.26,59.94,59.62,59.3,58.99,58.69,58.38,58.09,57.79,57.5,57.2,56.9,56.59,56.28,55.97,55.67,55.36,55.06,54.77,54.48,54.19,53.92,53.66,53.41,53.18,52.97,52.78,52.59,52.42,52.26,52.12,51.99,51.88,51.78,51.71,51.65,51.62,51.61,51.61,51.64,51.69,51.76,51.85,51.96,52.09,52.24,52.41,52.59,52.79,53,53.23,53.48,53.74,54.01,54.29,54.58,54.86,55.15,55.43,55.71,56,56.28,56.57,56.87,57.17,57.48,57.79,58.11,58.42,58.74,59.05,59.35,59.66,59.95,60.25,60.53,60.82,61.1,61.37,61.65,61.92,62.19,62.48,62.77,63.07,63.39,63.72,64.06,64.41,64.76,65.1,65.44,65.76,66.08,66.39,66.69,66.98,67.28,67.57,67.87,68.16,68.45,68.75,69.04,69.34,69.63,69.92,70.2,70.49,70.78,71.07,71.37,71.67,71.98,72.29,72.6,72.92,73.24,73.57,73.89,74.22,74.55,74.88,75.2,75.52,75.83,76.14,76.44,76.74,77.03,77.31,77.59,77.87,78.16,78.44,78.73,79.02,79.31,79.61,79.9,80.2,80.49,80.78,81.07,81.37,81.67,81.98,82.28,82.59,82.9,83.21,83.52,83.81,84.11,84.39,84.66,84.92,85.18,85.42,85.66,85.89,86.11,86.32,86.52,86.7,86.87,87.02,87.16,87.29,87.41,87.51,87.62,87.72,87.82,87.93,88.03,88.15,88.26,88.37,88.48,88.59,88.71,88.82,88.93,89.04,89.16,89.26,89.37,89.47,89.57,89.67,89.77,89.86,89.96,90.06,90.17,90.29,90.43,90.59,90.78,90.98,91.21,91.45,91.7,91.95,92.2,92.45,92.68,92.91,93.14,93.36,93.58,93.8,94.03,94.26,94.49,94.72,94.95,95.18,95.42,95.66,95.91,96.15,96.4,96.64,96.89,97.13,97.37,97.6,97.83,98.06,98.28,98.49,98.7,98.9,99.09,99.27,99.44,99.6,99.75,99.89,100.01,100.12,100.21,100.29,100.35,100.39,100.42,100.43,100.43,100.41,100.38,100.34,100.29,100.24,100.18,100.11,100.03,99.94,99.85,99.76,99.66,99.57,99.48,99.38,99.29,99.2,99.1,99.01,98.91,98.81,98.71,98.61,98.51,98.41,98.32,98.22,98.12,98.03,97.93,97.83,97.73,97.62,97.52,97.4,97.29,97.17,97.04,96.91,96.77,96.63,96.48,96.33,96.17,96.01,95.85,95.68,95.5,95.32,95.14,94.96,94.76,94.57,94.36,94.15,93.93,93.71,93.48,93.25,93.01,92.76,92.51,92.25,91.99,91.72,91.44,91.15,90.86,90.56,90.25,89.93,89.62,89.31,89,88.69,88.38,88.08,87.78,87.48,87.18,86.89,86.59,86.3,86.02,85.73,85.45,85.18,84.91,84.64,84.37,84.1,83.84,83.57,83.3,83.03,82.76,82.49,82.22,81.94,81.67,81.4,81.13,80.86,80.59,80.32,80.04,79.76,79.48,79.19,78.89,78.59,78.28,77.98,77.68,77.38,77.08,76.79,76.5,76.21,75.91,75.61,75.31,75.01,74.7,74.39,74.07,73.75,73.42,73.09,72.76,72.43,72.1,71.77,71.45,71.13,70.81,70.49,70.17,69.85,69.54,69.22,68.9,68.59,68.27,67.96,67.65,67.34,67.02,66.71,66.4,66.09,65.78,65.48,65.17,64.88,64.59,64.31,64.05,63.78,63.52,63.27,63.01,62.74,62.47,62.2,61.92,61.64,61.35,61.06,60.77,60.48,60.18,59.89,59.58,59.28,58.96,58.65,58.33,58.02,57.7,57.39,57.09,56.78,56.49,56.19,55.9,55.61,55.32,55.03,54.73,54.43,54.13,53.83,53.52,53.22,52.91,52.61,52.3,51.99,51.68,51.35,51.02,50.69,50.35,50.01,49.66,49.33,48.99,48.66,48.33,48.01,47.7,47.4,47.12,46.85,46.6,46.35,46.11,45.86,45.61,45.34,45.07,44.8,44.51,44.22,43.92,43.62,43.32,43.02,42.72,42.42,42.12,41.82,41.52,41.21,40.89,40.56,40.22,39.86,39.5,39.14,38.77,38.42,38.07,37.73,37.41,37.11,36.82,36.54,36.28,36.03,35.79,35.56,35.35,35.13,34.92,34.7,34.48,34.25,34.01,33.77,33.52,33.28,33.02,32.77,32.51,32.25,31.99,31.73,31.48,31.23,30.99,30.75,30.52,30.29,30.06,29.84,29.62,29.4,29.19,28.97,28.76,28.54,28.31,28.08,27.85,27.61,27.38,27.14,26.9,26.66,26.42,26.18,25.95,25.71,25.47,25.23,24.98,24.74,24.5,24.26,24.02,23.79,23.55,23.32,23.1,22.88,22.68,22.49,22.31,22.16,22.01,21.88,21.75,21.61,21.48,21.33,21.19,21.04,20.9,20.75,20.61,20.46,20.32,20.17,20.02,19.86,19.69,19.53,19.35,19.18,19,18.81,18.62,18.43,18.24,18.04,17.85,17.66,17.46,17.27,17.07,16.88,16.68,16.49,16.31,16.12,15.94,15.77,15.59,15.42,15.26,15.1,14.94,14.79,14.64,14.5,14.36,14.24,14.12,14.01,13.91,13.82,13.73,13.64,13.55,13.47,13.39,13.31,13.24,13.17,13.1,13.04,12.99,12.94,12.89,12.85,12.81,12.77,12.74,12.71,12.68,12.65,12.62,12.59,12.55,12.52,12.48,12.43,12.39,12.35,12.31,12.27,12.23,12.19,12.15,12.11,12.07,12.03,12,11.98,11.96,11.95,11.95,11.96,11.98,12.01,12.05,12.1,12.17,12.26,12.35,12.46,12.57,12.69,12.81,12.94,13.07,13.19,13.32,13.44,13.57,13.69,13.81,13.93,14.06,14.19,14.33,14.47,14.62,14.78,14.95,15.12,15.3,15.49,15.68,15.88,16.08,16.3,16.53,16.78,17.03,17.29,17.56,17.84,18.13,18.42,18.72,19.02,19.34,19.66,19.98,20.31,20.63,20.95,21.27,21.59,21.91,22.23,22.56,22.89,23.22,23.55,23.87,24.19,24.5,24.81,25.11,25.41,25.71,26.01,26.31,26.6,26.9,27.2,27.5,27.8,28.09,28.39,28.68,28.98,29.27,29.57,29.88,30.18,30.49,30.8,31.11,31.42,31.73,32.05,32.36,32.69,33.01,33.34,33.67,34.01,34.34,34.67,34.99,35.3,35.6,35.88,36.15,36.41,36.66,36.91,37.14,37.37,37.59,37.81,38.02,38.24,38.44,38.65,38.85,39.06,39.26,39.48,39.7,39.93,40.18,40.44,40.7,40.98,41.26,41.54,41.82,42.1,42.37,42.65,42.92,43.19,43.45,43.7,43.94,44.15,44.34,44.51,44.64,44.76,44.85,44.91,44.95,44.96,44.94,44.89,44.83,44.74,44.63,44.51,44.37,44.22,44.06,43.88,43.69,43.49,43.28,43.06,42.82,42.58,42.33,42.06,41.78,41.49,41.19,40.87,40.55,40.23,39.91,39.58,39.27,38.95,38.65,38.34,38.05,37.75,37.46,37.16,36.86,36.57,36.27,35.98,35.68,35.4,35.11,34.83,34.56,34.28,34,33.71,33.43,33.14,32.85,32.56,32.28,31.99,31.71,31.43,31.15,30.86,30.57,30.28,29.97,29.65,29.33,28.99,28.65,28.32,27.99,27.67,27.36,27.06,26.77,26.48,26.2,25.9,25.61,25.31,25,24.7,24.4,24.1,23.8,23.5,23.2,22.9,22.59,22.29,21.99,21.68,21.37,21.06,20.75,20.44,20.13,19.83,19.52,19.21,18.91,18.6,18.3,17.98,17.66,17.34,17.02,16.7,16.39,16.08,15.78,15.49,15.21,14.94,14.67,14.41,14.15,13.89,13.62,13.36,13.08,12.8,12.5,12.2,11.9,11.59,11.29,10.98,10.68,10.38,10.08,9.78,9.49,9.19,8.9,8.6,8.31,8.02,7.73,7.44,7.16,6.88,6.61,6.35,6.1,5.85,5.62,5.41,5.2,5,4.82,4.63,4.46,4.28,4.11,3.94,3.77,3.6,3.42,3.25,3.07,2.9,2.72,2.54,2.35,2.17,1.98,1.8,1.62,1.44,1.27,1.11,.95,.8,.67,.54,.43,.33,.24,.17,.11,.07,.03,.01,0,0,.02,.05,.09,.14,.19,.25,.31,.38,.46,.55,.66,.78,.92,1.07,1.25,1.43,1.63,1.84,2.06,2.28,2.52,2.76,3.02,3.28,3.54,3.81,4.07,4.33,4.58,4.83,5.06,5.28,5.5,5.7,5.89,6.08,6.26,6.43,6.6,6.75,6.9,7.04,7.16,7.28,7.39,7.49,7.58,7.66,7.73,7.79,7.85,7.89,7.93,7.97,8,8.03,8.04,8.05,8.05,8.03,8,7.95,7.9,7.83,7.75,7.66,7.56,7.45,7.33,7.2,7.07,6.92,6.77,6.61,6.44,6.27,6.09,5.91,5.72,5.54,5.35,5.16,4.97,4.78,4.59,4.4,4.21,4.02,3.83,3.63,3.44,3.24,3.04,2.85,2.65,2.46,2.27,2.08,1.89,1.7,1.52,1.33],elevationSource:`USGS 3DEP`,attribution:`OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP`,courseBuilder:{sections:[[{lat:34.076835957716156,lon:-118.70279894158774}],[{lat:34.076835957716156,lon:-118.70279894158774},{lon:-118.702951669693,lat:34.076496609367},{lon:-118.70325744152069,lat:34.07570125580506},{lon:-118.70352029800415,lat:34.075305797902246},{lon:-118.70378315448761,lat:34.07503919602699},{lon:-118.70413184165955,lat:34.07477703669808},{lon:-118.70445370674133,lat:34.07449265955948},{lon:-118.70459854602814,lat:34.07435047063214},{lon:-118.70474338531494,lat:34.074159403885204},{lon:-118.70497405529022,lat:34.07380392972088},{lon:-118.7054032087326,lat:34.073221837555465},{lon:-118.70574653148651,lat:34.072706393825655},{lon:-118.70594501495361,lat:34.07235980058864},{lon:-118.70625615119934,lat:34.071693271147296},{lon:-118.70652437210083,lat:34.071200035984475},{lon:-118.70690524578094,lat:34.070653474747175},{lon:-118.70790302753448,lat:34.069369264143276},{lon:-118.70798349380493,lat:34.06924039764466},{lon:-118.7080854177475,lat:34.06904931937217},{lon:-118.70816051959991,lat:34.068849353276676},{lon:-118.70820879936218,lat:34.06864938670921},{lon:-118.70833218097687,lat:34.06726293886176},{lon:-118.70854139328003,lat:34.06630307706192},{lon:-118.70857357978821,lat:34.06592535068705},{lon:-118.70854675769806,lat:34.06573426493841},{lon:-118.70847702026367,lat:34.06549874005066},{lon:-118.70828926563263,lat:34.065192112329086},{lon:-118.70801568031311,lat:34.06482326881708},{lon:-118.70738804340363,lat:34.06409002092256},{lon:-118.70712518692017,lat:34.063934482674725},{lon:-118.7068247795105,lat:34.06381893979152},{lon:-118.70642244815826,lat:34.06368117691716},{lon:-118.70617032051086,lat:34.063570077661836},{lon:-118.70572507381439,lat:34.06332565878736},{lon:-118.70551586151123,lat:34.063258998971946},{lon:-118.70527982711792,lat:34.06323677902185},{lon:-118.70503842830658,lat:34.063267886950385},{lon:-118.70470583438873,lat:34.06335232269882},{lon:-118.70443761348724,lat:34.06340120651474},{lon:-118.7035471200943,lat:34.06349453008498},{lon:-118.70301067829132,lat:34.063672288982104},{lon:-118.7027907371521,lat:34.063730060543364},{lon:-118.70249032974243,lat:34.06375228036413},{lon:-118.70214700698853,lat:34.063694508818},{lon:-118.70182514190674,lat:34.063601185468},{lon:-118.70146036148071,lat:34.06353008189423},{lon:-118.70118141174316,lat:34.06349453008498},{lon:-118.70070934295654,lat:34.06345009030245},{lon:-118.70049476623535,lat:34.06337898660189},{lon:-118.69993150234222,lat:34.063139011172126},{lon:-118.69967937469482,lat:34.06306790721058},{lon:-118.6994594335556,lat:34.063054575211154},{lon:-118.69921803474426,lat:34.06306790721058},{lon:-118.69776427745819,lat:34.06351230599148},{lon:-118.69741559028625,lat:34.063574521634834},{lon:-118.69703471660614,lat:34.063570077661836},{lon:-118.6966323852539,lat:34.06349897406196},{lon:-118.69624078273773,lat:34.063321214801306},{lon:-118.69541466236115,lat:34.062845706946206},{lon:-118.69520545005798,lat:34.06268127837549},{lon:-118.69501233100891,lat:34.062499073370404},{lon:-118.69473874568939,lat:34.062201322884846},{lon:-118.69448661804199,lat:34.0618680188615},{lon:-118.6943256855011,lat:34.06162359507793},{lon:-118.69418621063232,lat:34.06119251868709},{lon:-118.6941647529602,lat:34.06099697815806},{lon:-118.6941647529602,lat:34.06077921658337},{lon:-118.69419693946838,lat:34.06045923937687},{lon:-118.69429349899292,lat:34.059970382978676},{lon:-118.69436860084534,lat:34.0595126330677},{lon:-118.69436860084534,lat:34.05916598585905},{lon:-118.6943256855011,lat:34.05881489301025},{lon:-118.69398236274719,lat:34.057246067955674},{lon:-118.6939662694931,lat:34.05703718537548},{lon:-118.6939662694931,lat:34.05692607741035},{lon:-118.69399309158325,lat:34.0567883033313},{lon:-118.69407892227173,lat:34.05653497621445},{lon:-118.69424521923065,lat:34.05626387091739},{lon:-118.69440615177155,lat:34.0561083183063},{lon:-118.69463682174683,lat:34.05591276604734},{lon:-118.69518399238586,lat:34.05557943729336},{lon:-118.69554340839386,lat:34.0553838838143},{lon:-118.69577944278717,lat:34.05521055194433},{lon:-118.69616031646729,lat:34.05488610928646},{lon:-118.69631588459015,lat:34.05466388757138},{lon:-118.6964499950409,lat:34.054423887464736},{lon:-118.69657874107361,lat:34.0540061078805},{lon:-118.69658946990967,lat:34.0536905495956},{lon:-118.69650363922119,lat:34.05327721091018},{lon:-118.69635343551636,lat:34.05294387179269},{lon:-118.69616031646729,lat:34.05266831046593},{lon:-118.6959457397461,lat:34.052441638380586},{lon:-118.69560241699219,lat:34.05219718741323},{lon:-118.69521081447601,lat:34.05196162490505},{lon:-118.69467437267303,lat:34.051619391415656},{lon:-118.6944168806076,lat:34.05140160574855},{lon:-118.69411647319794,lat:34.05106825925624},{lon:-118.69347810745239,lat:34.05003265445937},{lon:-118.69279146194458,lat:34.048837026322175},{lon:-118.69220674037933,lat:34.047685829395974},{lon:-118.69204044342041,lat:34.04729468557022},{lon:-118.69195997714996,lat:34.04687687085418},{lon:-118.69197607040405,lat:34.046401270746415},{lon:-118.69205117225647,lat:34.04592122307278},{lon:-118.69208872318268,lat:34.04576565148436},{lon:-118.69213700294495,lat:34.04559674486521},{lon:-118.69226038455963,lat:34.0452767103484},{lon:-118.69237303733826,lat:34.04492555997503},{lon:-118.69247496128082,lat:34.04453440341673},{lon:-118.69253933429718,lat:34.04436549434517},{lon:-118.69255542755127,lat:34.04422325486604},{lon:-118.69255006313324,lat:34.04395655519967},{lon:-118.6924695968628,lat:34.043374258013316},{lon:-118.69245886802673,lat:34.043152006124586},{lon:-118.6924535036087,lat:34.04302754481249},{lon:-118.69247496128082,lat:34.04282307226036},{lon:-118.6924535036087,lat:34.04276084138576},{lon:-118.6924695968628,lat:34.042703055532755},{lon:-118.69257152080536,lat:34.04248524696368},{lon:-118.69267344474792,lat:34.042334114158436},{lon:-118.69278073310852,lat:34.04222743201613},{lon:-118.69293630123138,lat:34.042089634050356},{lon:-118.69305968284607,lat:34.04200517712195},{lon:-118.69330644607544,lat:34.04186737879505},{lon:-118.6934620141983,lat:34.041809592333266},{lon:-118.69359612464905,lat:34.04177403141415},{lon:-118.69430959224701,lat:34.04166734856729},{lon:-118.69485139846802,lat:34.041574000966236},{lon:-118.69531273841858,lat:34.041449537338295},{lon:-118.69563460350037,lat:34.041329518666984},{lon:-118.69598865509033,lat:34.041178383802205},{lon:-118.69711518287659,lat:34.04068941621814},{lon:-118.69823098182678,lat:34.0402182266064},{lon:-118.69888007640839,lat:34.0400315281116},{lon:-118.69993686676025,lat:34.0398181579001},{lon:-118.70046257972717,lat:34.03968035601987},{lon:-118.7012243270874,lat:34.03937363490208},{lon:-118.70180904865265,lat:34.03910247472929},{lon:-118.70185732841492,lat:34.03906691267514},{lon:-118.70234549045563,lat:34.03866683853832},{lon:-118.70257616043091,lat:34.03843568373247},{lon:-118.70273172855377,lat:34.038253426614475},{lon:-118.70302140712738,lat:34.03786223928283},{lon:-118.70311260223389,lat:34.03771998889677},{lon:-118.70323061943054,lat:34.037502167530775},{lon:-118.70331645011902,lat:34.03729323630722},{lon:-118.70339155197144,lat:34.03721766531241},{lon:-118.70346128940582,lat:34.03699095192397},{lon:-118.70349884033203,lat:34.03678646481859},{lon:-118.70353102684021,lat:34.0365375233293},{lon:-118.70354175567627,lat:34.036279690302365},{lon:-118.70352566242218,lat:34.035946284364286},{lat:34.035238832948274,lon:-118.70343999746943}]],resolution:5}},{id:`road-5f2b72f6-2a75-4b2f-8ed1-06f3215bdf95`,closed:!1,name:`Mulholland Drive, Hollywood`,width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[3008.37,-224.73],[3004.36,-217.79],[3000.36,-210.85],[2996.36,-203.91],[2992.35,-196.96],[2988.35,-190.02],[2984.35,-183.08],[2980.34,-176.14],[2976.27,-169.24],[2972.2,-162.33],[2968.13,-155.43],[2964.06,-148.53],[2960,-141.62],[2955.93,-134.72],[2951.86,-127.81],[2947.79,-120.91],[2943.72,-114.01],[2939.65,-107.1],[2935.59,-100.2],[2931.52,-93.29],[2927.45,-86.39],[2923.38,-79.48],[2919.31,-72.58],[2915.15,-65.75],[2909.87,-59.72],[2904.59,-53.69],[2899.31,-47.65],[2894.04,-41.62],[2888.76,-35.59],[2882.16,-31.13],[2875.32,-26.96],[2868.47,-22.8],[2861.63,-18.63],[2854.78,-14.46],[2847.94,-10.3],[2840.91,-6.57],[2833.16,-4.53],[2825.41,-2.49],[2817.66,-.45],[2809.91,1.59],[2802.09,2.53],[2794.13,1.54],[2786.18,.54],[2778.23,-.45],[2770.28,-1.45],[2762.33,-2.44],[2754.37,-3.43],[2746.42,-4.43],[2738.76,-6.41],[2731.49,-9.79],[2724.22,-13.17],[2716.96,-16.55],[2709.69,-19.93],[2702.42,-23.31],[2695.16,-26.69],[2687.89,-30.07],[2680.63,-33.45],[2673.36,-36.83],[2666.09,-40.21],[2658.83,-43.59],[2651.56,-46.97],[2644.3,-50.35],[2637.03,-53.73],[2629.76,-57.11],[2622.5,-60.49],[2615.23,-63.87],[2607.97,-67.24],[2600.7,-70.62],[2593.43,-74],[2586.17,-77.38],[2578.9,-80.76],[2571.61,-84.06],[2563.68,-85.23],[2555.75,-86.41],[2547.83,-87.58],[2539.9,-88.75],[2531.97,-89.93],[2524.05,-91.1],[2516.75,-90.23],[2510.83,-84.82],[2504.91,-79.42],[2498.99,-74.02],[2493.07,-68.61],[2487.16,-63.21],[2481.24,-57.81],[2475.32,-52.4],[2468.16,-49.48],[2460.29,-47.98],[2452.41,-46.48],[2444.54,-44.98],[2436.67,-43.48],[2429.38,-40.71],[2423.11,-35.73],[2416.83,-30.75],[2410.55,-25.77],[2404.27,-20.79],[2397.99,-15.81],[2391.71,-10.83],[2385.43,-5.85],[2379.15,-.87],[2372.63,3.7],[2365.33,7.02],[2358.04,10.33],[2350.59,12.37],[2342.71,10.89],[2334.83,9.42],[2326.96,7.94],[2319.08,6.46],[2311.2,4.99],[2303.33,3.51],[2295.45,2.03],[2287.57,.56],[2279.7,-.92],[2271.82,-2.4],[2263.95,-3.87],[2256.06,-4.71],[2248.16,-3.39],[2240.25,-2.07],[2232.77,.16],[2226.71,5.39],[2220.64,10.62],[2214.57,15.85],[2208.5,21.09],[2202.43,26.32],[2196.36,31.55],[2190.29,36.78],[2184.22,42.02],[2178.15,47.25],[2174.4,54.18],[2171.24,61.54],[2168.08,68.91],[2164.93,76.28],[2161.77,83.64],[2158.61,91.01],[2155.46,98.37],[2151.24,104.83],[2144.42,109.03],[2137.59,113.23],[2130.77,117.43],[2123.35,118.92],[2115.39,117.99],[2107.43,117.05],[2099.47,116.12],[2091.7,114.48],[2084.35,111.28],[2077.01,108.08],[2069.66,104.89],[2062.31,101.69],[2054.96,98.49],[2047.62,95.29],[2040.27,92.09],[2032.92,88.89],[2025.58,85.69],[2018.23,82.49],[2010.88,79.29],[2003.53,76.09],[1996.19,72.89],[1988.84,69.69],[1981.49,66.49],[1974.14,63.29],[1967.4,59.06],[1960.99,54.25],[1954.58,49.44],[1948.16,44.64],[1941.75,39.83],[1934.41,36.91],[1926.69,34.77],[1918.97,32.63],[1911.25,30.48],[1903.51,28.72],[1895.63,30.16],[1887.74,31.6],[1879.86,33.05],[1871.98,34.49],[1864.09,35.93],[1856.21,37.37],[1848.33,38.81],[1840.45,40.26],[1832.56,41.7],[1824.68,43.14],[1816.8,44.58],[1808.91,46.02],[1801.03,47.47],[1793.15,48.91],[1785.27,50.35],[1777.38,51.79],[1769.5,53.23],[1761.62,54.68],[1753.73,56.12],[1745.85,57.56],[1738.62,60.64],[1731.89,64.99],[1725.16,69.35],[1718.43,73.7],[1711.71,78.05],[1705.91,83.45],[1700.8,89.63],[1695.7,95.81],[1690.59,101.98],[1685.49,108.16],[1680.39,114.34],[1675.28,120.52],[1670.18,126.7],[1665.08,132.88],[1659.97,139.05],[1654.87,145.23],[1649.76,151.41],[1644.66,157.59],[1639.56,163.77],[1634.45,169.94],[1628.44,175.21],[1622.28,180.34],[1616.12,185.47],[1609.97,190.6],[1603.81,195.73],[1597.66,200.86],[1591.5,205.99],[1585.34,211.13],[1579.19,216.26],[1573.03,221.39],[1566.87,226.52],[1560.42,231.19],[1553.31,234.9],[1546.21,238.61],[1539.1,242.31],[1532,246.02],[1524.89,249.73],[1517.79,253.43],[1512.41,259.32],[1507.18,265.39],[1501.95,271.46],[1496.72,277.53],[1491.48,283.6],[1486.25,289.67],[1481.02,295.74],[1475.78,301.81],[1470.55,307.88],[1464.02,311.62],[1456.11,312.91],[1448.2,314.2],[1440.29,315.49],[1432.38,316.79],[1424.47,318.08],[1416.56,319.37],[1408.65,320.66],[1400.74,321.95],[1392.83,323.24],[1384.93,324.53],[1377.02,325.82],[1369.14,326.3],[1361.37,324.36],[1353.59,322.42],[1346.35,319.62],[1341.2,313.48],[1336.05,307.34],[1330.9,301.2],[1325.75,295.06],[1320.6,288.92],[1315.45,282.78],[1310.3,276.64],[1305.15,270.5],[1300,264.36],[1294.49,258.64],[1287.74,254.31],[1281,249.97],[1274.26,245.64],[1267.52,241.31],[1260.78,236.97],[1254.04,232.64],[1247.3,228.31],[1240.53,224.05],[1232.64,222.64],[1224.75,221.23],[1216.86,219.81],[1208.97,218.4],[1201.09,216.98],[1193.2,215.57],[1185.31,214.16],[1177.42,212.74],[1169.53,211.33],[1161.65,209.92],[1153.76,208.5],[1145.87,207.09],[1137.98,205.67],[1130.09,204.26],[1122.21,202.85],[1114.32,201.43],[1106.43,200.02],[1098.54,198.6],[1090.66,197.19],[1082.77,195.78],[1074.88,194.36],[1066.99,192.95],[1059.1,191.54],[1051.22,190.12],[1043.33,188.71],[1035.44,187.29],[1027.53,187.12],[1019.6,188.25],[1011.66,189.38],[1003.73,190.52],[995.8,191.65],[987.86,192.78],[979.93,193.92],[972,195.05],[964.06,196.18],[956.13,197.32],[948.21,198.48],[940.49,200.65],[932.78,202.82],[925.06,204.99],[917.35,207.16],[909.63,209.33],[901.92,211.5],[894.2,213.67],[886.49,215.84],[879.14,213.38],[871.87,210.02],[864.59,206.66],[858.34,202.19],[854.39,195.22],[850.44,188.25],[846.49,181.28],[842.54,174.3],[838.59,167.33],[834.63,160.36],[830.68,153.39],[826.73,146.42],[820,142.57],[812.62,139.45],[805.24,136.33],[797.86,133.21],[790.47,130.09],[783.09,126.97],[775.71,123.86],[768.33,120.74],[760.95,117.62],[753.56,114.5],[746.18,111.38],[738.8,108.26],[731.42,105.15],[724.04,102.03],[716.65,98.91],[709.27,95.79],[701.89,92.67],[694.51,89.56],[687.13,86.44],[679.74,83.32],[672.36,80.2],[664.98,77.08],[657.6,73.96],[650.21,70.85],[642.83,67.73],[635.45,64.61],[628.07,61.49],[620.69,58.37],[613.3,55.25],[605.92,52.14],[598.54,49.02],[590.7,47.74],[582.72,46.99],[574.74,46.25],[566.76,45.5],[558.78,44.75],[550.8,44.01],[542.82,43.26],[534.84,42.51],[526.86,41.77],[518.89,41.02],[510.91,40.28],[502.93,39.53],[494.95,38.78],[486.97,38.04],[478.99,37.29],[471.01,36.54],[463.03,35.8],[455.06,35.05],[447.08,34.31],[439.1,33.56],[431.12,32.81],[423.14,32.07],[415.16,31.32],[407.18,30.57],[399.2,29.83],[391.22,29.08],[383.25,28.34],[375.27,27.59],[367.29,26.84],[359.31,26.1],[351.33,25.35],[343.35,24.61],[335.37,23.86],[327.39,23.11],[319.56,23.6],[311.99,26.21],[304.41,28.82],[296.83,31.43],[289.25,34.03],[281.68,36.64],[274.1,39.25],[266.52,41.86],[258.95,44.47],[251.37,47.08],[243.79,49.68],[236.21,52.29],[228.64,54.9],[221.06,57.51],[213.48,60.12],[205.9,62.73],[198.41,65.56],[191.01,68.64],[183.62,71.72],[176.22,74.8],[168.82,77.89],[161.43,80.97],[154.03,84.05],[146.63,87.13],[139.23,90.21],[131.84,93.3],[124.44,96.38],[117.04,99.46],[109.65,102.54],[102.25,105.63],[94.85,108.71],[87.45,111.79],[80.06,114.87],[72.66,117.95],[65.26,121.04],[57.86,124.12],[50.47,127.2],[43.07,130.28],[35.67,133.36],[28.28,136.45],[20.88,139.53],[13.48,142.61],[6.08,145.69],[-1.31,148.78],[-8.71,151.86],[-16.42,153.88],[-24.31,155.28],[-32.2,156.68],[-40.09,158.08],[-47.98,159.48],[-55.87,160.88],[-63.76,162.28],[-71.65,163.68],[-79.54,165.08],[-87.43,166.48],[-95.32,167.88],[-103.21,169.28],[-111.1,170.68],[-118.99,172.08],[-126.89,173.48],[-134.74,174.42],[-142.31,171.79],[-149.88,169.17],[-157.45,166.54],[-165.02,163.91],[-172.59,161.29],[-180.17,158.66],[-187.74,156.03],[-195.31,153.41],[-202.88,150.78],[-210.45,148.15],[-218.02,145.53],[-225.59,142.9],[-233,139.9],[-240.08,136.14],[-247.16,132.39],[-254.23,128.63],[-261.31,124.87],[-268.39,121.11],[-275.47,117.36],[-282.55,113.6],[-289.62,109.84],[-296.7,106.08],[-303.78,102.33],[-310.86,98.57],[-317.94,94.81],[-325.02,91.05],[-332.09,87.3],[-339.17,83.54],[-346.25,79.78],[-353.33,76.02],[-360.41,72.27],[-367.48,68.51],[-374.56,64.75],[-381.64,60.99],[-388.72,57.24],[-396.48,56.07],[-404.49,55.86],[-412.5,55.66],[-420.51,55.45],[-428.52,55.24],[-436.53,55.04],[-444.54,54.83],[-452.55,54.63],[-460.56,54.42],[-468.5,54.6],[-475.87,57.76],[-483.23,60.91],[-490.6,64.07],[-497.96,67.23],[-505.33,70.38],[-512.7,73.54],[-520.06,76.7],[-527.43,79.85],[-534.79,83.01],[-540.52,88.36],[-545.64,94.53],[-550.75,100.7],[-555.87,106.87],[-560.98,113.03],[-566.1,119.2],[-571.21,125.37],[-576.33,131.54],[-581.44,137.71],[-586.56,143.88],[-591.67,150.05],[-596.79,156.21],[-601.91,162.38],[-608.44,166.57],[-615.92,169.45],[-623.4,172.33],[-630.88,175.2],[-638.36,178.08],[-645.84,180.96],[-653.32,183.83],[-660.8,186.71],[-668.28,189.59],[-675.76,192.46],[-683.24,195.34],[-690.72,198.22],[-698.2,201.09],[-705.68,203.97],[-713.61,204.65],[-721.62,205.01],[-729.62,205.37],[-737.63,205.73],[-745.64,206.09],[-753.64,206.45],[-761.65,206.8],[-769.65,207.16],[-776.59,204.26],[-782.83,199.24],[-789.08,194.21],[-795.32,189.19],[-801.56,184.16],[-807.8,179.14],[-814.13,175.19],[-821.1,179.16],[-828.06,183.12],[-835.03,187.09],[-841.99,191.05],[-848.96,195.01],[-855.92,198.98],[-862.88,202.94],[-869.85,206.91],[-876.81,210.87],[-884.71,211.72],[-892.71,212.23],[-900.71,212.74],[-908.7,213.25],[-916.7,213.76],[-924.27,213.51],[-927.94,206.39],[-931.62,199.27],[-935.29,192.14],[-938.97,185.02],[-942.64,177.9],[-946.32,170.78],[-950,163.66],[-953.67,156.54],[-958.64,150.48],[-964.9,145.47],[-971.16,140.47],[-977.96,137.77],[-985.8,139.44],[-993.64,141.11],[-1001.47,142.78],[-1009.31,144.45],[-1017.15,146.12],[-1024.99,147.79],[-1032.83,149.46],[-1040.54,148.47],[-1048.2,146.11],[-1055.86,143.75],[-1063.52,141.39],[-1071.17,139.02],[-1078.83,136.66],[-1086.49,134.3],[-1094.15,131.94],[-1101.81,129.58],[-1109.46,127.22],[-1117.12,124.85],[-1124.78,122.49],[-1132.44,120.13],[-1140.09,117.77],[-1148.06,117.44],[-1156.07,117.44],[-1164.09,117.44],[-1172.1,117.44],[-1180.11,117.44],[-1188.13,117.44],[-1196.14,117.44],[-1204.15,117.44],[-1212.17,117.44],[-1219.36,114.71],[-1226.05,110.3],[-1232.74,105.88],[-1239.43,101.47],[-1246.12,97.06],[-1252.81,92.64],[-1259.49,88.23],[-1266.18,83.82],[-1272.87,79.4],[-1279.56,74.99],[-1286.25,70.58],[-1292.94,66.16],[-1299.63,61.75],[-1306.32,57.34],[-1313.17,53.21],[-1320.39,49.74],[-1327.62,46.27],[-1334.84,42.8],[-1342.06,39.33],[-1349.29,35.87],[-1356.51,32.4],[-1363.74,28.93],[-1370.96,25.46],[-1378.19,22],[-1385.41,18.53],[-1392.64,15.06],[-1399.86,11.59],[-1407.08,8.12],[-1414.8,7.17],[-1422.79,7.68],[-1430.79,8.2],[-1438.79,8.71],[-1446.78,9.23],[-1454.78,9.74],[-1462.78,10.26],[-1470.77,10.78],[-1478.77,11.29],[-1486.77,11.81],[-1494.77,12.32],[-1502.76,12.84],[-1510.76,13.36],[-1518.76,13.87],[-1526.75,14.39],[-1533.88,12.82],[-1539.11,6.75],[-1544.35,.69],[-1549.59,-5.38],[-1554.83,-11.44],[-1560.06,-17.51],[-1565.3,-23.57],[-1570.91,-29.07],[-1578.57,-31.43],[-1586.23,-33.78],[-1593.89,-36.14],[-1601.82,-36.15],[-1609.81,-35.57],[-1617.8,-35],[-1625.79,-34.42],[-1633.79,-33.84],[-1641.78,-33.27],[-1649.77,-32.69],[-1657.77,-32.12],[-1665.76,-31.54],[-1673.75,-30.96],[-1681.74,-30.39],[-1689.74,-29.81],[-1697.73,-29.24],[-1705.49,-29.23],[-1710.78,-35.25],[-1716.08,-41.26],[-1721.37,-47.28],[-1726.66,-53.3],[-1728.7,-61.03],[-1730.69,-68.8],[-1732.67,-76.56],[-1734.65,-84.33],[-1736.63,-92.09],[-1738.62,-99.85],[-1740.6,-107.62],[-1742.58,-115.38],[-1744.56,-123.15],[-1746.54,-130.91],[-1748.53,-138.68],[-1750.56,-146.42],[-1754.24,-153.54],[-1757.92,-160.66],[-1761.6,-167.78],[-1765.3,-174.89],[-1771.64,-179.79],[-1777.98,-184.69],[-1784.32,-189.59],[-1790.66,-194.49],[-1797,-199.39],[-1803.34,-204.29],[-1809.68,-209.19],[-1816.02,-214.09],[-1822.36,-218.99],[-1828.71,-223.89],[-1835.05,-228.79],[-1841.39,-233.69],[-1847.73,-238.59],[-1853.78,-243.8],[-1859.17,-249.73],[-1864.55,-255.67],[-1869.94,-261.6],[-1875.32,-267.53],[-1880.71,-273.47],[-1886.09,-279.4],[-1891.48,-285.34],[-1896.86,-291.27],[-1902.93,-296.17],[-1910.51,-298.79],[-1918.08,-301.41],[-1925.66,-304.02],[-1933.23,-306.64],[-1940.8,-309.26],[-1948.38,-311.88],[-1955.95,-314.5],[-1963.52,-317.12],[-1971.1,-319.74],[-1978.67,-322.36],[-1986.24,-324.98],[-1993.82,-327.6],[-2001.39,-330.21],[-2009.12,-331.68],[-2017.11,-331.11],[-2025.1,-330.54],[-2033.1,-329.96],[-2041.09,-329.39],[-2049.08,-328.82],[-2057.08,-328.25],[-2065.07,-327.68],[-2073.06,-327.11],[-2081.06,-326.54],[-2089.05,-325.97],[-2096.83,-327.87],[-2104.6,-329.82],[-2112.38,-331.76],[-2120.15,-333.7],[-2127.06,-337.18],[-2132.72,-342.85],[-2138.39,-348.51],[-2144.06,-354.18],[-2149.72,-359.85],[-2155.39,-365.51],[-2161.7,-370.4],[-2168.35,-374.88],[-2174.99,-379.36],[-2181.63,-383.84],[-2188.28,-388.32],[-2194.92,-392.8],[-2201.86,-396.64],[-2209.59,-398.73],[-2217.33,-400.82],[-2225.07,-402.91],[-2232.8,-405],[-2240.54,-407.09],[-2248.27,-409.18],[-2256.01,-411.27],[-2263.75,-413.37],[-2271.48,-415.46],[-2278.93,-413.27],[-2286.32,-410.16],[-2293.31,-406.43],[-2299.32,-401.13],[-2305.33,-395.82],[-2309.79,-389.45],[-2312.63,-381.96],[-2315.47,-374.46],[-2318.31,-366.97],[-2321.14,-359.47],[-2323.98,-351.98],[-2326.82,-344.49],[-2329.66,-336.99],[-2332.5,-329.5],[-2334.09,-321.67],[-2335.35,-313.76],[-2336.61,-305.84],[-2337.86,-297.93],[-2339.12,-290.02],[-2341.46,-282.56],[-2346.32,-276.19],[-2351.17,-269.81],[-2356.02,-263.43],[-2360.87,-257.05],[-2365.73,-250.68],[-2370.58,-244.3],[-2374.3,-237.65],[-2372.81,-229.78],[-2371.33,-221.91],[-2369.84,-214.03],[-2368.35,-206.16],[-2366.87,-198.28],[-2365.38,-190.41],[-2363.89,-182.53],[-2362.4,-174.66],[-2360.92,-166.78],[-2359.43,-158.91],[-2357.94,-151.04],[-2360.68,-143.65],[-2363.93,-136.33],[-2367.19,-129.01],[-2371.44,-122.66],[-2378.68,-119.23],[-2385.92,-115.79],[-2393.33,-116.51],[-2400.82,-119.36],[-2408.3,-122.21],[-2415.79,-125.06],[-2423.28,-127.92],[-2430.83,-130.32],[-2438.79,-129.41],[-2446.75,-128.5],[-2454.71,-127.59],[-2462.67,-126.68],[-2468.77,-121.98],[-2474.33,-116.21],[-2479.89,-110.44],[-2485.45,-104.67],[-2491.01,-98.9],[-2496.57,-93.13],[-2502.13,-87.36],[-2507.69,-81.58],[-2513.25,-75.81],[-2519.61,-71.42],[-2527.37,-69.39],[-2535.12,-67.36],[-2542.87,-65.33],[-2550.62,-63.29],[-2558.38,-61.29],[-2566.38,-60.88],[-2574.39,-60.48],[-2582.39,-60.07],[-2590.39,-59.66],[-2598.4,-59.26],[-2606.4,-58.85],[-2614.4,-58.44],[-2622.41,-58.04],[-2630.41,-57.63],[-2638.41,-57.22],[-2646.42,-56.82],[-2654.42,-56.41],[-2662.42,-56],[-2670.43,-55.59],[-2678.43,-55.19],[-2686.43,-54.78],[-2694.44,-54.37],[-2702.44,-53.97],[-2710.44,-53.56],[-2718.45,-53.15],[-2726.45,-52.75],[-2734.45,-52.34],[-2742.46,-51.93],[-2750.46,-51.52],[-2758.46,-51.12],[-2766.47,-50.71],[-2774.47,-50.3],[-2782.47,-49.9],[-2790.48,-49.49],[-2798.48,-49.08],[-2806.48,-48.68],[-2814.49,-48.27],[-2822.49,-47.86],[-2830.49,-47.46]],elevation:[40.71,41.06,41.41,41.76,42.11,42.46,42.81,43.16,43.51,43.86,44.21,44.56,44.91,45.26,45.61,45.96,46.31,46.66,47.01,47.36,47.71,48.06,48.41,48.76,49.12,49.47,49.83,50.18,50.54,50.89,51.25,51.61,51.96,52.32,52.67,53.02,53.38,53.72,54.07,54.42,54.76,55.11,55.46,55.81,56.15,56.5,56.84,57.18,57.52,57.87,58.22,58.57,58.93,59.3,59.67,60.03,60.4,60.77,61.14,61.5,61.87,62.23,62.59,62.94,63.28,63.61,63.93,64.26,64.58,64.91,65.24,65.58,65.91,66.24,66.57,66.88,67.18,67.47,67.74,67.99,68.23,68.45,68.66,68.86,69.03,69.19,69.33,69.45,69.54,69.61,69.66,69.68,69.68,69.67,69.64,69.6,69.55,69.48,69.41,69.33,69.23,69.14,69.03,68.92,68.81,68.69,68.58,68.47,68.37,68.27,68.19,68.11,68.05,67.99,67.93,67.87,67.81,67.75,67.71,67.69,67.69,67.72,67.77,67.86,67.96,68.08,68.22,68.38,68.56,68.74,68.93,69.13,69.32,69.52,69.7,69.89,70.08,70.27,70.46,70.65,70.83,71.01,71.17,71.32,71.45,71.56,71.65,71.73,71.79,71.84,71.88,71.91,71.94,71.95,71.96,71.95,71.93,71.91,71.87,71.83,71.78,71.72,71.65,71.57,71.46,71.33,71.16,70.97,70.75,70.51,70.26,70,69.72,69.45,69.17,68.89,68.61,68.32,68.03,67.74,67.45,67.15,66.86,66.56,66.26,65.97,65.67,65.37,65.07,64.77,64.47,64.17,63.87,63.58,63.29,63,62.71,62.42,62.12,61.82,61.51,61.2,60.88,60.55,60.23,59.91,59.59,59.29,59.01,58.74,58.49,58.24,57.99,57.74,57.47,57.19,56.9,56.6,56.3,55.99,55.7,55.41,55.12,54.85,54.58,54.32,54.06,53.81,53.56,53.3,53.04,52.77,52.49,52.2,51.9,51.58,51.26,50.94,50.63,50.33,50.04,49.75,49.47,49.19,48.91,48.61,48.29,47.97,47.64,47.3,46.97,46.64,46.31,45.98,45.65,45.32,44.97,44.63,44.28,43.94,43.6,43.28,42.96,42.66,42.36,42.07,41.79,41.51,41.24,40.97,40.71,40.44,40.18,39.92,39.67,39.41,39.14,38.87,38.58,38.28,37.96,37.62,37.27,36.9,36.53,36.15,35.76,35.38,35,34.62,34.25,33.9,33.57,33.27,32.99,32.75,32.54,32.37,32.24,32.14,32.09,32.08,32.11,32.18,32.27,32.4,32.56,32.75,32.96,33.19,33.44,33.7,33.97,34.24,34.52,34.8,35.09,35.37,35.66,35.95,36.22,36.49,36.75,37.01,37.25,37.48,37.71,37.95,38.18,38.42,38.66,38.92,39.18,39.45,39.72,40,40.29,40.58,40.88,41.19,41.49,41.8,42.11,42.42,42.72,43.02,43.3,43.59,43.86,44.13,44.4,44.66,44.93,45.19,45.45,45.72,45.99,46.27,46.56,46.86,47.18,47.5,47.84,48.2,48.57,48.96,49.35,49.75,50.16,50.56,50.96,51.35,51.72,52.09,52.45,52.79,53.13,53.47,53.8,54.12,54.45,54.77,55.1,55.42,55.73,56.04,56.33,56.62,56.9,57.18,57.46,57.73,58.01,58.29,58.56,58.84,59.12,59.39,59.67,59.95,60.23,60.51,60.8,61.09,61.38,61.68,61.97,62.27,62.55,62.83,63.09,63.33,63.56,63.78,63.97,64.15,64.32,64.48,64.62,64.76,64.88,65,65.12,65.23,65.34,65.45,65.57,65.7,65.83,65.98,66.14,66.31,66.49,66.68,66.88,67.09,67.31,67.54,67.75,67.95,68.12,68.26,68.35,68.39,68.4,68.36,68.29,68.2,68.09,67.96,67.83,67.7,67.57,67.44,67.33,67.23,67.14,67.07,67.01,66.97,66.94,66.92,66.91,66.91,66.91,66.92,66.93,66.94,66.96,66.99,67.01,67.04,67.07,67.11,67.14,67.17,67.19,67.22,67.24,67.26,67.28,67.3,67.32,67.34,67.36,67.38,67.39,67.41,67.42,67.42,67.42,67.41,67.39,67.36,67.31,67.25,67.18,67.09,66.99,66.87,66.74,66.61,66.46,66.3,66.13,65.96,65.8,65.63,65.47,65.33,65.19,65.07,64.96,64.85,64.75,64.65,64.55,64.45,64.35,64.25,64.15,64.05,63.94,63.83,63.71,63.59,63.46,63.33,63.2,63.08,62.96,62.83,62.7,62.56,62.4,62.24,62.06,61.87,61.67,61.47,61.27,61.08,60.89,60.7,60.52,60.34,60.17,60,59.83,59.66,59.48,59.31,59.14,58.97,58.81,58.66,58.51,58.38,58.25,58.14,58.04,57.94,57.85,57.77,57.69,57.61,57.53,57.46,57.37,57.29,57.21,57.12,57.03,56.94,56.85,56.76,56.67,56.58,56.48,56.39,56.3,56.21,56.11,56,55.89,55.77,55.65,55.51,55.36,55.2,55.03,54.85,54.66,54.46,54.26,54.05,53.84,53.64,53.43,53.23,53.02,52.82,52.63,52.43,52.25,52.07,51.9,51.74,51.59,51.44,51.3,51.16,51.03,50.91,50.79,50.67,50.56,50.45,50.34,50.24,50.14,50.04,49.94,49.85,49.75,49.65,49.54,49.44,49.33,49.22,49.1,48.98,48.85,48.72,48.6,48.47,48.34,48.22,48.1,47.99,47.89,47.79,47.7,47.61,47.52,47.44,47.36,47.28,47.21,47.15,47.1,47.05,47.01,46.96,46.91,46.86,46.81,46.74,46.67,46.59,46.5,46.42,46.34,46.26,46.2,46.14,46.1,46.06,46.04,46.01,45.99,45.97,45.94,45.92,45.89,45.86,45.83,45.81,45.79,45.78,45.77,45.78,45.79,45.81,45.85,45.89,45.94,46,46.07,46.14,46.21,46.29,46.37,46.45,46.53,46.61,46.69,46.78,46.86,46.93,47.01,47.08,47.15,47.21,47.27,47.33,47.39,47.45,47.51,47.56,47.62,47.68,47.73,47.78,47.82,47.85,47.89,47.91,47.93,47.95,47.96,47.97,47.97,47.96,47.94,47.91,47.86,47.8,47.73,47.65,47.58,47.51,47.45,47.4,47.34,47.3,47.25,47.2,47.16,47.1,47.05,46.99,46.93,46.87,46.81,46.74,46.67,46.61,46.54,46.47,46.41,46.36,46.31,46.28,46.25,46.24,46.24,46.25,46.28,46.31,46.36,46.41,46.47,46.54,46.62,46.7,46.78,46.86,46.95,47.03,47.12,47.21,47.31,47.42,47.55,47.7,47.87,48.06,48.26,48.48,48.7,48.93,49.16,49.38,49.61,49.84,50.08,50.33,50.6,50.88,51.17,51.46,51.76,52.07,52.36,52.65,52.92,53.17,53.41,53.63,53.84,54.03,54.21,54.39,54.56,54.71,54.86,55,55.13,55.25,55.36,55.46,55.56,55.65,55.75,55.86,55.98,56.12,56.28,56.47,56.68,56.91,57.16,57.42,57.68,57.94,58.2,58.46,58.72,58.97,59.22,59.45,59.68,59.89,60.08,60.25,60.4,60.53,60.64,60.74,60.83,60.91,60.99,61.06,61.12,61.18,61.24,61.29,61.33,61.37,61.39,61.42,61.43,61.45,61.47,61.49,61.51,61.53,61.56,61.58,61.59,61.6,61.6,61.59,61.56,61.52,61.46,61.4,61.32,61.23,61.12,60.99,60.84,60.66,60.47,60.27,60.06,59.86,59.68,59.51,59.35,59.21,59.08,58.95,58.82,58.68,58.54,58.39,58.25,58.11,57.99,57.87,57.76,57.66,57.56,57.46,57.35,57.24,57.12,56.99,56.86,56.71,56.56,56.39,56.22,56.06,55.91,55.8,55.72,55.67,55.63,55.58,55.53,55.45,55.34,55.2,55.03,54.85,54.65,54.45,54.26,54.09,53.94,53.8,53.68,53.57,53.45,53.32,53.19,53.04,52.87,52.7,52.52,52.34,52.16,51.98,51.81,51.64,51.47,51.3,51.13,50.96,50.8,50.64,50.49,50.35,50.22,50.1,50,49.91,49.84,49.78,49.74,49.72,49.71,49.72,49.74,49.76,49.78,49.79,49.8,49.8,49.79,49.76,49.72,49.66,49.59,49.5,49.42,49.32,49.23,49.14,49.05,48.96,48.86,48.76,48.66,48.58,48.51,48.47,48.44,48.43,48.43,48.44,48.46,48.47,48.49,48.52,48.57,48.62,48.69,48.78,48.89,49.02,49.16,49.32,49.5,49.69,49.9,50.11,50.32,50.53,50.74,50.95,51.15,51.36,51.56,51.78,52,52.23,52.48,52.73,53.01,53.3,53.6,53.92,54.24,54.58,54.92,55.27,55.61,55.96,56.29,56.62,56.93,57.23,57.53,57.82,58.11,58.41,58.72,59.05,59.37,59.7,60.01,60.31,60.58,60.82,61.05,61.27,61.48,61.68,61.86,62.01,62.11,62.14,62.12,62.04,61.95,61.85,61.77,61.72,61.69,61.69,61.71,61.75,61.81,61.87,61.94,62.02,62.1,62.18,62.27,62.36,62.45,62.53,62.61,62.67,62.72,62.75,62.75,62.72,62.67,62.58,62.46,62.31,62.13,61.91,61.67,61.41,61.13,60.83,60.54,60.24,59.95,59.66,59.36,59.06,58.75,58.43,58.12,57.82,57.52,57.23,56.95,56.67,56.4,56.12,55.83,55.53,55.22,54.9,54.57,54.23,53.9,53.57,53.24,52.91,52.6,52.3,52.01,51.74,51.49,51.26,51.04,50.82,50.59,50.32,50.02,49.67,49.3,48.9,48.51,48.13,47.76,47.43,47.11,46.8,46.5,46.2,45.9,45.59,45.27,44.95,44.61,44.27,43.92,43.56,43.2,42.85,42.51,42.2,41.92,41.66,41.43,41.22,41.02,40.82,40.6,40.38,40.14,39.88,39.61,39.34,39.08,38.83,38.59,38.36,38.14,37.94,37.76,37.58,37.42,37.27,37.13,37,36.88,36.78,36.7,36.63,36.59,36.56,36.54,36.54,36.56,36.58,36.61,36.65,36.68,36.71,36.73,36.74,36.73,36.72,36.69,36.65,36.59,36.53,36.45,36.36,36.26,36.15,36.03,35.91,35.77,35.63,35.47,35.3,35.11,34.91,34.69,34.44,34.18,33.9,33.61,33.3,32.99,32.69,32.38,32.08,31.79,31.5,31.21,30.92,30.62,30.32,30,29.68,29.36,29.03,28.71,28.41,28.14,27.91,27.71,27.56,27.45,27.37,27.3,27.25,27.2,27.16,27.13,27.1,27.09,27.1,27.12,27.16,27.22,27.29,27.38,27.49,27.61,27.74,27.89,28.05,28.21,28.38,28.55,28.73,28.91,29.09,29.27,29.44,29.61,29.77,29.93,30.1,30.27,30.44,30.62,30.78,30.93,31.06,31.15,31.21,31.22,31.19,31.12,31,30.84,30.65,30.43,30.17,29.89,29.59,29.28,28.97,28.65,28.33,28.02,27.7,27.39,27.08,26.78,26.48,26.19,25.89,25.59,25.28,24.94,24.58,24.18,23.75,23.3,22.85,22.41,22,21.62,21.27,20.94,20.62,20.31,20.01,19.71,19.41,19.12,18.83,18.55,18.27,18,17.73,17.46,17.19,16.9,16.61,16.29,15.97,15.63,15.3,14.97,14.65,14.34,14.03,13.73,13.43,13.13,12.83,12.54,12.25,11.96,11.67,11.38,11.09,10.79,10.48,10.17,9.85,9.52,9.18,8.84,8.49,8.14,7.79,7.44,7.1,6.77,6.45,6.14,5.84,5.56,5.29,5.02,4.76,4.49,4.21,3.93,3.63,3.33,3.03,2.72,2.43,2.14,1.88,1.63,1.41,1.21,1.03,.86,.7,.54,.4,.27,.16,.08,.02,0,.01,.06,.14,.24,.37,.52,.69,.86,1.05,1.25,1.46,1.67,1.88,2.1,2.32,2.54,2.75],elevationSource:`USGS 3DEP`,attribution:`OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP`,courseBuilder:{sections:[[{lat:34.12808977226303,lon:-118.47259246395454}],[{lat:34.12808919407294,lon:-118.47259124609252},{lon:-118.47229242324829,lat:34.12852049137423},{lon:-118.47158432006836,lat:34.12951517189734},{lon:-118.47128391265869,lat:34.12979936418276},{lon:-118.47079038619995,lat:34.13004803164873},{lon:-118.47038269042969,lat:34.130136841280745},{lon:-118.46969604492188,lat:34.1300657935826},{lon:-118.46785068511963,lat:34.12935531331691},{lon:-118.46727132797241,lat:34.12928426496191},{lon:-118.46677780151367,lat:34.12965726815949},{lon:-118.46632719039917,lat:34.12972831620098},{lon:-118.46570491790771,lat:34.130136841280745},{lon:-118.4654688835144,lat:34.13022565081944},{lon:-118.46443891525269,lat:34.1300657935826},{lon:-118.46418142318726,lat:34.13010131743913},{lon:-118.4635591506958,lat:34.13054536438615},{lon:-118.46330165863037,lat:34.13104269419745},{lon:-118.46302270889282,lat:34.13118478789178},{lon:-118.4626579284668,lat:34.131149264490574},{lon:-118.46132755279541,lat:34.13066969711328},{lon:-118.4609842300415,lat:34.13045655518336},{lon:-118.46059799194336,lat:34.130367745887256},{lon:-118.45883846282959,lat:34.13063417349562},{lon:-118.45847368240356,lat:34.13082955320803},{lon:-118.45765829086304,lat:34.13164659074876},{lon:-118.45688581466675,lat:34.13217943706394},{lon:-118.45639228820801,lat:34.132392574649444},{lon:-118.45585584640503,lat:34.132907654928886},{lon:-118.45480442047119,lat:34.13304974548805},{lon:-118.45454692840576,lat:34.132996461556374},{lon:-118.45398902893066,lat:34.13244585896186},{lon:-118.45338821411133,lat:34.13212615258355},{lon:-118.4511137008667,lat:34.1317886834279},{lon:-118.4502124786377,lat:34.13189525278051},{lon:-118.44952583312988,lat:34.132055106557516},{lon:-118.44924688339233,lat:34.13194853740643},{lon:-118.44888210296631,lat:34.13141568963563},{lon:-118.44639301300049,lat:34.13054536438615},{lon:-118.44341039657593,lat:34.13031446026481},{lon:-118.44210147857666,lat:34.13068745891651},{lon:-118.4397840499878,lat:34.131486736199165},{lon:-118.4384536743164,lat:34.131682113940926},{lon:-118.43740224838257,lat:34.13138016633148},{lon:-118.43566417694092,lat:34.13061641168119},{lon:-118.43482732772827,lat:34.13059864986303},{lon:-118.4340763092041,lat:34.1308650767436},{lon:-118.43334674835205,lat:34.13159330593247},{lon:-118.43223094940186,lat:34.13194853740643},{lon:-118.43151211738586,lat:34.1319751797068},{lon:-118.43107223510742,lat:34.131682113940926},{lon:-118.43037486076355,lat:34.13201070276088},{lon:-118.42987060546875,lat:34.13203734504167},{lon:-118.42952728271484,lat:34.131486736199165},{lon:-118.42931270599365,lat:34.1313446430124},{lon:-118.42865824699402,lat:34.13146009374482},{lon:-118.42751026153564,lat:34.131167026193054},{lon:-118.42670559883118,lat:34.131167026193054},{lon:-118.4256649017334,lat:34.13059864986303},{lon:-118.42459201812744,lat:34.1301723651074},{lon:-118.42326164245605,lat:34.130243412715984},{lon:-118.42285394668579,lat:34.12985265012992},{lon:-118.42257499694824,lat:34.129781602192935},{lon:-118.42138409614563,lat:34.12985265012992},{lon:-118.42114806175232,lat:34.12963062512853},{lon:-118.42089056968689,lat:34.12879580590476},{lon:-118.420729637146,lat:34.128538253629074},{lon:-118.41978549957275,lat:34.12793433487103},{lon:-118.41925978660583,lat:34.12745474925444},{lon:-118.41811180114746,lat:34.12712614272415},{lon:-118.41721057891846,lat:34.12717943035638},{lon:-118.41682434082031,lat:34.12709949889546},{lon:-118.41647028923035,lat:34.12680641622548},{lon:-118.41600894927979,lat:34.12654885788885},{lon:-118.41521501541138,lat:34.1263712309926},{lon:-118.41501116752625,lat:34.12644228179589},{lon:-118.41482877731323,lat:34.12657550189111},{lon:-118.41456055641174,lat:34.12716166781607},{lon:-118.41448545455933,lat:34.127552442841434},{lon:-118.41410994529724,lat:34.12796097843662},{lon:-118.41429233551025,lat:34.128760281499595},{lon:-118.41416358947754,lat:34.12900007094474},{lon:-118.41395974159241,lat:34.12908000060865},{lon:-118.4135091304779,lat:34.12893790337614},{lon:-118.41313362121582,lat:34.12897342770664},{lon:-118.41256499290466,lat:34.129461885737484},{lon:-118.41211438179016,lat:34.12955957700494},{lat:34.12968407115643,lon:-118.40915657467195}]],resolution:5}},{id:`road-cf5aa9d3-6e94-467e-925f-8d2d3b86ee82`,closed:!1,name:`Newtown Road, Placerville`,width:8,shoulderWidth:0,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[1749.58,750.01],[1745.91,742.87],[1742.24,735.74],[1738.57,728.61],[1734.91,721.47],[1731.24,714.34],[1727.57,707.21],[1723.9,700.07],[1718.45,694.34],[1712.39,689.08],[1706.33,683.83],[1700.26,678.58],[1694.08,673.5],[1687.08,669.57],[1680.09,665.64],[1673.1,661.71],[1666.11,657.77],[1660.95,651.72],[1656.05,645.37],[1651.15,639.02],[1646.25,632.67],[1641.35,626.32],[1636.45,619.97],[1631.55,613.62],[1626.65,607.27],[1621.75,600.91],[1616.85,594.56],[1610.42,590.19],[1603.04,587.06],[1595.66,583.92],[1588.27,580.78],[1580.89,577.64],[1573.51,574.51],[1566.13,571.37],[1558.74,568.23],[1551.36,565.09],[1543.98,561.96],[1537.5,557.48],[1531.83,551.81],[1527.27,545.32],[1523.59,538.19],[1519.92,531.06],[1516.24,523.93],[1512.57,516.8],[1508.89,509.67],[1505.21,502.55],[1501.54,495.42],[1497.86,488.29],[1494.18,481.16],[1490.51,474.03],[1486.83,466.9],[1483.15,459.77],[1479.48,452.64],[1475.8,445.51],[1472.13,438.38],[1468.45,431.25],[1464.23,424.43],[1459.91,417.67],[1455.59,410.91],[1451.27,404.15],[1446.95,397.4],[1442.63,390.64],[1438.32,383.88],[1434,377.12],[1429.68,370.36],[1425.36,363.6],[1419.5,358.15],[1413.52,352.8],[1407.54,347.45],[1401.56,342.11],[1395.58,336.76],[1389.59,331.42],[1382.76,327.22],[1375.93,323.02],[1369.1,318.81],[1362.27,314.61],[1355.44,310.4],[1348.6,306.2],[1341.77,302],[1335.89,296.55],[1330.09,291.02],[1324.29,285.48],[1318.49,279.94],[1312.68,274.4],[1306.88,268.86],[1301.08,263.32],[1293.54,260.97],[1285.74,259.1],[1277.94,257.22],[1270.14,255.35],[1262.34,253.48],[1254.54,251.61],[1247.2,248.42],[1239.9,245.08],[1232.61,241.74],[1225.32,238.4],[1218.02,235.06],[1210.73,231.73],[1203.43,228.39],[1196.14,225.05],[1188.85,221.71],[1181.55,218.37],[1174.26,215.04],[1166.96,211.7],[1159.67,208.36],[1152.38,205.02],[1145.08,201.69],[1139.15,196.39],[1133.48,190.71],[1127.81,185.04],[1122.13,179.37],[1116.46,173.7],[1110.79,168.03],[1105.12,162.35],[1099.45,156.68],[1093.77,151.01],[1086.04,148.98],[1078.24,147.18],[1070.23,147.56],[1062.21,147.93],[1054.2,148.3],[1046.19,148.68],[1038.18,149.05],[1030.16,149.42],[1022.15,149.79],[1014.14,150.17],[1006.12,150.54],[998.21,150.57],[991.47,146.2],[984.74,141.84],[978.01,137.48],[971.28,133.12],[964.55,128.75],[957.82,124.39],[951.09,120.03],[944.35,115.67],[937.62,111.3],[930.89,106.94],[924.16,102.58],[917.43,98.21],[910.7,93.85],[903.97,89.49],[897.08,85.51],[889.21,83.93],[881.35,82.36],[873.48,80.79],[865.62,79.21],[857.75,77.64],[849.89,76.07],[842.02,74.49],[834.15,72.92],[826.29,71.35],[818.42,69.77],[810.56,68.2],[802.69,66.63],[794.83,65.05],[786.96,63.48],[779.09,61.91],[771.23,60.34],[763.36,58.76],[755.71,56.53],[748.39,53.25],[741.07,49.97],[733.75,46.69],[726.43,43.41],[719.11,40.13],[711.79,36.85],[704.46,33.58],[696.47,32.92],[688.48,32.25],[680.53,32.14],[672.74,34.08],[664.96,36.03],[657.18,37.98],[649.4,39.92],[641.62,41.87],[633.83,43.81],[626.05,45.76],[618.19,45.96],[610.25,44.77],[602.32,43.58],[594.39,42.39],[586.46,41.2],[579.78,36.95],[573.32,32.2],[566.85,27.46],[560.38,22.72],[554.67,17.18],[549.59,10.97],[544.51,4.76],[539.43,-1.45],[534.35,-7.66],[529.27,-13.87],[524.19,-20.07],[517.92,-25.07],[511.59,-29.99],[504.8,-33.91],[496.93,-35.48],[489.07,-37.06],[481.2,-38.63],[473.34,-40.2],[465.47,-41.78],[457.61,-43.35],[449.74,-44.92],[441.87,-46.5],[434.01,-48.07],[426.54,-50.92],[419.14,-54.04],[411.75,-57.15],[404.36,-60.26],[396.96,-63.38],[389.57,-66.49],[382.18,-69.6],[374.79,-72.71],[367.39,-75.83],[359.84,-78],[351.83,-77.53],[343.82,-77.06],[335.82,-76.59],[327.93,-75.48],[320.32,-72.94],[312.71,-70.4],[305.1,-67.87],[297.49,-65.33],[289.88,-62.79],[282.27,-60.26],[274.66,-57.72],[267.05,-55.18],[259.44,-52.65],[251.83,-50.11],[244.22,-47.57],[236.61,-45.04],[229,-42.5],[221.25,-40.66],[213.25,-40.03],[205.26,-39.39],[197.26,-38.76],[189.26,-38.13],[181.27,-37.5],[173.27,-36.87],[165.27,-36.24],[157.28,-35.61],[149.28,-34.97],[141.29,-34.34],[133.29,-33.71],[125.29,-33.08],[117.3,-32.45],[109.3,-31.82],[101.3,-31.19],[93.31,-30.56],[85.31,-29.92],[77.45,-28.43],[69.66,-26.52],[61.87,-24.6],[54.08,-22.68],[46.29,-20.76],[38.51,-18.85],[30.72,-16.93],[22.93,-15.01],[15.14,-13.09],[7.35,-11.18],[-.44,-9.26],[-8.23,-7.34],[-16.02,-5.43],[-23.81,-3.51],[-31.6,-1.59],[-39.41,.02],[-47.42,-.4],[-55.43,-.82],[-63.45,-1.24],[-71.46,-1.67],[-79.06,-3.92],[-86.51,-6.9],[-93.96,-9.87],[-101.41,-12.85],[-108.86,-15.83],[-116.3,-18.81],[-123.75,-21.79],[-131.2,-24.77],[-138.65,-27.75],[-146.09,-30.73],[-153.54,-33.71],[-160.99,-36.69],[-168.54,-38.76],[-176.47,-37.54],[-184.4,-36.32],[-192.33,-35.1],[-200.25,-33.88],[-208.18,-32.66],[-216.09,-31.36],[-223.86,-29.37],[-231.63,-27.38],[-239.41,-25.39],[-247.18,-23.4],[-254.95,-21.41],[-262.72,-19.42],[-270.49,-17.43],[-278.26,-15.44],[-286.03,-13.45],[-293.8,-11.46],[-301.57,-9.47],[-309.34,-7.48],[-317.11,-5.49],[-324.88,-3.5],[-332.65,-1.51],[-340.43,.48],[-348.2,2.47],[-355.97,4.46],[-363.74,6.45],[-371.6,7.06],[-379.56,6.07],[-386.97,3.39],[-394.01,-.45],[-401.06,-4.29],[-407.65,-8.82],[-414.04,-13.67],[-420.43,-18.52],[-426.82,-23.37],[-433.21,-28.22],[-439.6,-33.07],[-445.99,-37.92],[-452.38,-42.77],[-458.77,-47.62],[-465.16,-52.47],[-471.55,-57.32],[-477.94,-62.17],[-484.33,-67.02],[-490.72,-71.87],[-497.1,-76.72],[-503.49,-81.57],[-509.88,-86.42],[-516.27,-91.27],[-522.66,-96.12],[-529.05,-100.97],[-535.44,-105.82],[-541.83,-110.67],[-548.22,-115.52],[-554.61,-120.37],[-560.24,-125.98],[-565.09,-132.37],[-569.94,-138.75],[-574.8,-145.14],[-579.65,-151.53],[-584.5,-157.91],[-589.36,-164.3],[-594.55,-170.34],[-601.02,-175.09],[-607.48,-179.83],[-613.95,-184.58],[-620.42,-189.32],[-627.85,-192.26],[-635.4,-194.98],[-642.95,-197.69],[-650.49,-200.41],[-658.04,-203.13],[-665.59,-205.84],[-672.82,-209.28],[-679.93,-212.99],[-687.04,-216.7],[-694.16,-220.41],[-701.27,-224.12],[-708.38,-227.83],[-716.13,-229.07],[-724.15,-229.25],[-732.17,-229.43],[-740.19,-229.61],[-748.21,-229.79],[-756.23,-229.98],[-764.24,-230.16],[-772.26,-230.34],[-780.28,-230.52],[-788.3,-230.71],[-796.16,-231.9],[-803.86,-234.16],[-811.56,-236.43],[-819.25,-238.69],[-826.95,-240.96],[-834.64,-243.22],[-842.34,-245.48],[-850.03,-247.75],[-857.71,-248.76],[-865.32,-246.22],[-872.93,-243.68],[-880.54,-241.15],[-888.15,-238.61],[-895.76,-236.07],[-903.37,-233.54],[-910.49,-229.94],[-917.35,-225.79],[-924.22,-221.64],[-931.08,-217.49],[-937.94,-213.34],[-944.81,-209.19],[-951.67,-205.04],[-958.54,-200.89],[-965.4,-196.74],[-972.27,-192.59],[-979.13,-188.44],[-985.99,-184.29],[-993.53,-181.55],[-1001.08,-178.83],[-1008.62,-176.1],[-1016.17,-173.38],[-1023.71,-170.65],[-1031.26,-167.93],[-1038.8,-165.2],[-1046.35,-162.48],[-1053.94,-160.09],[-1061.95,-160.47],[-1069.97,-160.85],[-1077.98,-161.23],[-1085.99,-161.61],[-1093.93,-162.44],[-1101.6,-164.78],[-1109.27,-167.12],[-1116.94,-169.46],[-1124.62,-171.8],[-1132.29,-174.15],[-1139.96,-176.49],[-1147.63,-178.83],[-1155.31,-181.17],[-1162.98,-183.51],[-1170.65,-185.85],[-1178.32,-188.19],[-1185.99,-190.53],[-1193.67,-192.87],[-1201.34,-195.21],[-1209.33,-195.42],[-1217.35,-195.42],[-1225.37,-195.42],[-1233.06,-193.56],[-1240.57,-190.75],[-1248.08,-187.93],[-1255.59,-185.11],[-1263.45,-184.43],[-1271.47,-184.69],[-1279.49,-184.95],[-1287.5,-185.21],[-1295.52,-185.47],[-1303.54,-185.72],[-1311.56,-185.98],[-1319.16,-187.89],[-1326.33,-191.48],[-1333.51,-195.06],[-1340.68,-198.65],[-1347.85,-202.24],[-1355.62,-204.03],[-1363.52,-205.44],[-1371.42,-206.85],[-1379.31,-208.26],[-1387.21,-209.67],[-1395.11,-211.08],[-1402.71,-213.2],[-1409.28,-217.8],[-1415.85,-222.4],[-1421.52,-227.86],[-1425.77,-234.66],[-1429.62,-241.65],[-1431.82,-249.36],[-1434.02,-257.07],[-1436.23,-264.78],[-1438.43,-272.5],[-1440.63,-280.21],[-1442.84,-287.92],[-1445.04,-295.64],[-1447.24,-303.35],[-1449.45,-311.06],[-1451.61,-318.79],[-1453.1,-326.67],[-1454.59,-334.55],[-1456.08,-342.43],[-1457.57,-350.31],[-1459.06,-358.19],[-1460.55,-366.08],[-1462.05,-373.96],[-1463.54,-381.84],[-1464.16,-389.74],[-1462.94,-397.66],[-1461.72,-405.59],[-1460.5,-413.52],[-1459.28,-421.45],[-1458.06,-429.38],[-1456.17,-437.05],[-1451.82,-443.79],[-1447.46,-450.52],[-1443.1,-457.26],[-1438.74,-463.99],[-1434.39,-470.72],[-1430.03,-477.46],[-1425.67,-484.19],[-1421.31,-490.93],[-1416.96,-497.66],[-1418.21,-505.11],[-1420.74,-512.72],[-1423.28,-520.33],[-1430.27,-523.49],[-1437.88,-526.03],[-1445.76,-527.07],[-1453.78,-527.39],[-1461.79,-527.71],[-1469.81,-528.03],[-1477.82,-528.35],[-1485.84,-528.67],[-1493.85,-528.99],[-1501.87,-529.31],[-1509.88,-529.63],[-1517.9,-529.95],[-1525.91,-530.27],[-1533.93,-530.59],[-1541.94,-530.91]],elevation:[4.84,4.8,4.74,4.65,4.53,4.37,4.17,3.93,3.67,3.39,3.11,2.84,2.58,2.33,2.08,1.83,1.57,1.29,1.02,.75,.51,.3,.15,.04,0,.02,.09,.22,.4,.63,.9,1.2,1.54,1.91,2.29,2.69,3.09,3.51,3.92,4.32,4.71,5.09,5.44,5.77,6.06,6.33,6.57,6.79,6.99,7.18,7.37,7.58,7.79,8.02,8.27,8.53,8.8,9.08,9.36,9.64,9.93,10.21,10.49,10.78,11.06,11.35,11.65,11.95,12.26,12.58,12.91,13.26,13.61,13.94,14.26,14.53,14.75,14.9,15,15.04,15.05,15.05,15.04,15.05,15.08,15.12,15.17,15.24,15.31,15.39,15.47,15.54,15.61,15.66,15.7,15.71,15.71,15.7,15.68,15.66,15.65,15.65,15.66,15.68,15.71,15.75,15.79,15.84,15.9,15.96,16.01,16.06,16.1,16.12,16.11,16.09,16.04,15.98,15.91,15.83,15.76,15.71,15.67,15.66,15.66,15.67,15.69,15.72,15.74,15.75,15.77,15.78,15.79,15.8,15.81,15.83,15.85,15.86,15.88,15.89,15.89,15.89,15.89,15.88,15.89,15.9,15.92,15.95,15.98,16.03,16.08,16.13,16.18,16.23,16.28,16.33,16.39,16.44,16.5,16.56,16.61,16.65,16.68,16.69,16.71,16.74,16.79,16.86,16.97,17.1,17.25,17.41,17.57,17.74,17.91,18.07,18.21,18.34,18.44,18.51,18.55,18.56,18.53,18.47,18.39,18.29,18.18,18.06,17.95,17.83,17.73,17.63,17.53,17.44,17.36,17.28,17.2,17.14,17.08,17.04,17.02,17.01,17.01,17.02,17.03,17.06,17.09,17.14,17.2,17.27,17.36,17.46,17.57,17.69,17.81,17.92,18.04,18.15,18.26,18.37,18.47,18.58,18.69,18.81,18.94,19.08,19.24,19.39,19.56,19.73,19.9,20.06,20.22,20.38,20.52,20.66,20.79,20.91,21.03,21.13,21.23,21.33,21.42,21.51,21.6,21.69,21.77,21.85,21.93,21.99,22.06,22.11,22.17,22.23,22.3,22.37,22.46,22.56,22.68,22.8,22.94,23.08,23.22,23.37,23.51,23.65,23.79,23.93,24.08,24.22,24.37,24.52,24.67,24.82,24.95,25.08,25.21,25.32,25.44,25.56,25.68,25.8,25.94,26.08,26.24,26.4,26.57,26.76,26.96,27.18,27.41,27.66,27.93,28.21,28.51,28.82,29.15,29.49,29.84,30.19,30.55,30.91,31.27,31.61,31.95,32.27,32.58,32.86,33.13,33.39,33.62,33.85,34.06,34.26,34.46,34.65,34.84,35.04,35.23,35.42,35.62,35.81,35.99,36.17,36.33,36.49,36.64,36.78,36.9,37.02,37.14,37.27,37.4,37.56,37.74,37.96,38.22,38.51,38.82,39.11,39.37,39.57,39.7,39.78,39.8,39.79,39.75,39.7,39.63,39.56,39.48,39.41,39.33,39.26,39.19,39.14,39.09,39.06,39.04,39.03,39.05,39.08,39.13,39.2,39.28,39.37,39.46,39.56,39.65,39.74,39.82,39.91,39.99,40.07,40.15,40.24,40.34,40.46,40.58,40.71,40.84,40.98,41.11,41.23,41.34,41.43,41.51,41.58,41.64,41.68,41.71,41.74,41.77,41.79,41.81,41.83,41.85,41.86,41.88,41.88,41.89,41.9,41.91,41.92,41.95,41.98,42.02,42.08,42.15,42.23,42.33,42.44,42.58,42.74,42.92,43.11,43.3,43.5,43.7,43.91,44.12,44.34,44.58,44.84,45.11,45.4,45.68,45.95,46.21,46.44,46.65,46.84,47.02,47.18,47.34,47.5,47.66,47.85,48.06,48.29,48.55,48.84,49.14,49.45,49.76,50.06,50.35,50.64,50.91,51.17,51.43,51.68,51.94,52.2,52.47,52.75,53.02,53.28,53.53,53.76,53.97,54.16,54.33,54.49,54.62,54.72,54.79,54.83,54.83,54.81,54.79,54.78,54.81,54.89,55.01,55.15,55.32,55.48,55.62,55.74,55.83,55.9,55.96,55.99,56.02,56.05,56.06,56.07,56.07,56.05,56.02,55.97,55.91,55.84,55.78,55.71,55.66,55.6,55.56,55.51,55.47,55.43,55.39,55.34,55.28,55.21,55.13,55.05,54.97,54.9,54.84,54.8,54.77,54.75,54.75,54.75,54.76,54.78,54.8,54.82,54.86,54.9,54.96,55.04,55.13,55.23,55.35,55.48,55.62,55.75,55.89,56.03,56.16,56.29,56.42,56.54,56.66,56.77,56.88,56.99,57.09,57.19,57.29,57.38,57.48,57.57,57.67,57.77,57.87,57.98,58.09,58.21,58.34,58.46,58.59,58.71,58.83,58.96,59.08,59.2,59.32,59.43,59.55,59.66,59.76,59.85,59.93,59.99,60.03,60.06,60.08,60.09,60.09,60.1,60.1,60.1,60.11,60.12,60.14,60.17,60.2,60.24,60.28,60.34,60.4,60.48,60.56,60.66,60.79,60.93,61.09,61.28,61.48,61.7,61.93,62.16,62.39,62.62,62.83,63.04,63.23,63.42,63.58,63.73,63.85,63.96,64.05,64.13,64.2,64.27,64.35,64.42,64.49,64.54,64.56,64.55,64.49,64.41,64.3,64.21,64.16,64.18,64.27,64.43,64.65,64.9,65.17,65.42,65.66,65.88,66.07,66.24,66.38,66.5,66.58,66.64,66.66,66.66,66.62,66.56,66.48,66.37,66.24,66.1,65.95,65.78,65.62,65.46,65.3,65.17,65.04,64.93,64.83,64.74,64.67,64.6,64.55,64.52,64.51,64.52,64.55,64.6,64.67,64.77,64.89,65.06,65.27,65.53,65.84,66.21,66.61,67.05,67.51,67.98,68.46,68.94,69.41,69.88,70.36,70.84,71.32,71.81,72.31,72.83,73.37,73.92,74.48,75.05,75.61,76.16,76.69,77.21,77.7,78.18,78.65,79.1,79.54,79.98,80.41,80.84,81.25,81.65,82.04,82.42,82.79,83.15,83.51,83.87,84.23,84.61,84.99,85.38,85.79,86.2,86.63,87.08,87.53,88,88.47,88.93,89.39,89.83,90.26,90.66,91.04,91.4,91.74,92.07,92.39,92.7,93,93.3,93.6,93.89,94.18,94.48,94.77,95.07,95.37,95.68,95.99,96.32,96.65,96.99,97.34,97.69,98.05,98.42,98.79,99.18,99.57,99.97,100.37,100.79,101.22,101.66,102.1,102.55,103,103.45,103.91,104.36,104.81,105.24,105.67,106.09,106.5,106.9,107.28,107.66,108.01,108.35,108.67,108.96,109.21,109.44,109.63,109.79,109.92,110.03,110.1,110.15,110.18,110.2,110.2,110.2,110.18,110.16,110.15,110.15,110.18,110.24,110.34,110.5,110.71,110.98,111.28,111.63,112,112.4,112.82,113.26,113.72,114.19,114.67,115.15,115.64,116.12,116.59,117.06,117.52,117.98,118.44,118.89,119.35,119.81,120.27],elevationSource:`USGS 3DEP`,attribution:`OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP`,courseBuilder:{sections:[[{lat:38.715716396154704,lon:-120.71479722186058}],[{lat:38.71571707800764,lon:-120.71479551050973},{lon:-120.71449041366577,lat:38.715250887437236},{lon:-120.71416854858398,lat:38.71503323268075},{lon:-120.71382522583008,lat:38.71488254823029},{lon:-120.71324586868286,lat:38.71429655012554},{lon:-120.7123875617981,lat:38.71401192074126},{lon:-120.71225881576538,lat:38.713911463040915},{lon:-120.71155071258545,lat:38.71283990545274},{lon:-120.71105718612671,lat:38.71223714725042},{lon:-120.71064949035645,lat:38.71195250966596},{lon:-120.71009159088135,lat:38.711684614433494},{lon:-120.70961952209473,lat:38.71133300041737},{lon:-120.70908308029175,lat:38.71123253895226},{lon:-120.70781707763672,lat:38.71078046061214},{lon:-120.7072377204895,lat:38.7103283794132},{lon:-120.70706605911255,lat:38.71029489180327},{lon:-120.70614337921143,lat:38.7103283794132},{lon:-120.70498466491699,lat:38.70974234397451},{lon:-120.70337533950806,lat:38.709491184458756},{lon:-120.7027530670166,lat:38.709273512164714},{lon:-120.70249557495117,lat:38.70925676811464},{lon:-120.70180892944336,lat:38.709390720405395},{lon:-120.70137977600098,lat:38.70934048832578},{lon:-120.70105791091919,lat:38.70915630373187},{lon:-120.70067167282104,lat:38.70878793312056},{lon:-120.70047855377197,lat:38.70867072389166},{lon:-120.6996202468872,lat:38.7085367702519},{lon:-120.69880485534668,lat:38.708268862219455},{lon:-120.69844007492065,lat:38.70828560650091},{lon:-120.69721698760986,lat:38.708603747103155},{lon:-120.69558620452881,lat:38.708704212262376},{lon:-120.69419145584106,lat:38.708972118663496},{lon:-120.6937837600708,lat:38.708955374542825},{lon:-120.69271087646484,lat:38.708620491306164},{lon:-120.69215297698975,lat:38.70868746807898},{lon:-120.69039344787598,lat:38.709039095106874},{lon:-120.69022178649902,lat:38.70902235100192},{lon:-120.68998575210571,lat:38.708921886289744},{lon:-120.68820476531982,lat:38.707866998288466},{lon:-120.68779706954956,lat:38.70744838762511},{lon:-120.68747520446777,lat:38.70726419815679},{lon:-120.6869387626648,lat:38.70711349732974},{lon:-120.68644523620605,lat:38.70691256239962},{lon:-120.68550109863281,lat:38.70689581779661},{lon:-120.68477153778076,lat:38.70672837155092},{lon:-120.68419218063354,lat:38.7068790731897},{lon:-120.68326950073242,lat:38.70731443169518},{lon:-120.68249702453613,lat:38.70753210995386},{lon:-120.68204641342163,lat:38.707515365495965},{lon:-120.6807804107666,lat:38.70721396458305},{lon:-120.68048000335693,lat:38.70721396458305},{lon:-120.68013668060303,lat:38.70731443169518},{lon:-120.67947149276733,lat:38.7072976871863},{lon:-120.67908525466919,lat:38.707146986429876},{lon:-120.67848443984985,lat:38.707063263650184},{lon:-120.67826986312866,lat:38.70694605159386},{lon:-120.67816257476807,lat:38.70681209472281},{lon:-120.67790508270264,lat:38.706108817032174},{lon:-120.6777548789978,lat:38.70548925714493},{lon:-120.67784070968628,lat:38.70505388752605},{lon:-120.6783127784729,lat:38.70448455402456},{lon:-120.67822694778442,lat:38.70428361170647},{lon:-120.67803382873535,lat:38.7042333760387},{lat:38.704196827258755,lon:-120.67686297062704}]],resolution:5}},{id:`pocono-raceway-north-south`,name:`Pocono North/South`,venueName:`Pocono Raceway`,configName:`North/South Course`,location:{city:`Long Pond`,state:`PA`,country:`US`,lat:41.055965,lon:-75.508317},width:15,coneSpacing:10,points:[[287.03,-289.08],[294.46,-286.09],[301.88,-283.11],[309.29,-280.09],[316.72,-277.11],[324.15,-274.15],[331.59,-271.19],[339.03,-268.26],[346.47,-265.31],[353.92,-262.37],[361.37,-259.45],[368.82,-256.52],[376.24,-253.54],[383.67,-250.56],[391.09,-247.56],[398.49,-244.52],[405.87,-241.42],[413.22,-238.27],[420.55,-235.05],[427.8,-231.67],[434.96,-228.1],[442.01,-224.32],[448.94,-220.32],[455.74,-216.09],[462.35,-211.59],[468.84,-206.9],[475.15,-201.99],[481.33,-196.9],[487.39,-191.67],[493.3,-186.28],[499.06,-180.72],[504.66,-175],[510.08,-169.12],[515.32,-163.07],[520.28,-156.79],[524.89,-150.26],[529.09,-143.44],[532.84,-136.38],[535.92,-129],[538.39,-121.39],[540.18,-113.59],[541.26,-105.67],[541.83,-97.69],[541.59,-89.69],[540.69,-81.75],[539.25,-73.88],[537.33,-66.11],[534.94,-58.48],[532,-51.03],[528.59,-43.8],[524.71,-36.8],[520.36,-30.09],[515.58,-23.67],[510.38,-17.59],[504.76,-11.9],[498.72,-6.65],[492.31,-1.87],[485.56,2.44],[478.54,6.27],[471.31,9.7],[463.81,12.48],[456.13,14.7],[448.35,16.59],[440.46,17.93],[432.53,18.96],[424.58,19.87],[416.62,20.75],[408.7,21.86],[400.84,23.35],[393.11,25.42],[385.59,28.14],[378.45,31.73],[372,36.45],[366.45,42.21],[361.96,48.82],[358.68,56.11],[356.84,63.88],[356.46,71.86],[357.32,79.81],[359.27,87.57],[362.23,94.99],[366.07,102.01],[370.74,108.5],[376.12,114.41],[382.14,119.68],[388.66,124.31],[395.57,128.35],[402.85,131.66],[410.38,134.37],[418.07,136.56],[425.76,138.77],[433.28,141.51],[440.47,145],[447.12,149.44],[453.13,154.71],[458.39,160.73],[462.66,167.49],[465.64,174.91],[467.41,182.7],[467.72,190.69],[466.66,198.61],[464.42,206.28],[460.98,213.5],[456.54,220.15],[451.41,226.29],[445.66,231.85],[439.42,236.86],[432.74,241.26],[425.83,245.29],[418.78,249.09],[411.68,252.77],[404.48,256.27],[397.26,259.72],[389.99,263.06],[382.68,266.32],[375.36,269.55],[368.06,272.82],[360.74,276.05],[353.4,279.25],[346.07,282.45],[338.75,285.69],[331.42,288.91],[324.12,292.18],[316.84,295.5],[309.56,298.83],[302.31,302.21],[295.08,305.64],[287.86,309.1],[280.66,312.58],[273.46,316.07],[266.23,319.52],[259.05,323.04],[251.92,326.68],[244.97,330.64],[238.25,334.97],[231.92,339.87],[226.12,345.38],[221.01,351.53],[216.83,358.35],[213.68,365.69],[211.47,373.38],[210.3,381.28],[210.19,389.28],[211.12,397.22],[212.99,405],[215.68,412.53],[219.31,419.66],[223.83,426.25],[229.07,432.29],[234.98,437.68],[241.42,442.43],[248.27,446.55],[255.49,450.01],[262.96,452.87],[270.66,455.03],[278.51,456.56],[286.44,457.62],[294.41,458.35],[302.38,459.07],[310.28,460.33],[317.95,462.56],[325.02,466.26],[331.14,471.4],[335.83,477.85],[338.52,485.35],[338.56,493.3],[336.3,500.95],[332.1,507.74],[326.67,513.61],[320.47,518.67],[313.8,523.08],[306.94,527.2],[299.98,531.15],[293.01,535.08],[286.01,538.97],[278.99,542.81],[271.96,546.62],[264.91,550.41],[257.82,554.13],[250.64,557.67],[243.41,561.09],[236.13,564.41],[228.75,567.51],[221.31,570.45],[213.81,573.23],[206.25,575.87],[198.66,578.39],[191.04,580.83],[183.39,583.21],[175.72,585.48],[168.01,587.62],[160.26,589.62],[152.48,591.49],[144.66,593.19],[136.81,594.72],[128.93,596.13],[121.02,597.32],[113.07,598.25],[105.1,598.93],[97.11,599.37],[89.11,599.51],[81.11,599.37],[73.12,598.92],[65.15,598.16],[57.22,597.1],[49.32,595.83],[41.48,594.22],[33.71,592.33],[25.99,590.19],[18.36,587.78],[10.81,585.13],[3.35,582.25],[-4,579.09],[-11.25,575.7],[-18.41,572.13],[-25.45,568.33],[-32.38,564.32],[-39.18,560.1],[-45.87,555.72],[-52.4,551.09],[-58.76,546.24],[-65.05,541.29],[-71.2,536.17],[-77.27,530.95],[-83.22,525.6],[-89.08,520.15],[-94.87,514.63],[-100.51,508.96],[-106.03,503.16],[-111.49,497.31],[-116.89,491.41],[-122.2,485.41],[-127.43,479.36],[-132.57,473.23],[-137.63,467.03],[-142.61,460.77],[-147.56,454.47],[-152.46,448.15],[-157.33,441.8],[-162.18,435.43],[-167.02,429.06],[-171.82,422.66],[-176.61,416.25],[-181.39,409.83],[-186.15,403.4],[-190.91,396.96],[-195.67,390.53],[-200.43,384.1],[-205.18,377.66],[-209.93,371.22],[-214.69,364.79],[-219.46,358.36],[-224.22,351.93],[-228.98,345.5],[-233.75,339.07],[-238.49,332.62],[-243.26,326.2],[-248.02,319.77],[-252.78,313.33],[-257.54,306.9],[-262.32,300.48],[-267.07,294.04],[-271.83,287.61],[-276.58,281.17],[-281.35,274.74],[-286.13,268.33],[-290.93,261.92],[-295.72,255.51],[-300.49,249.08],[-305.28,242.67],[-310.04,236.24],[-314.82,229.83],[-319.6,223.41],[-324.39,216.99],[-329.18,210.58],[-333.94,204.15],[-338.68,197.71],[-343.43,191.26],[-348.16,184.81],[-352.91,178.37],[-357.65,171.92],[-362.38,165.47],[-367.12,159.02],[-371.86,152.57],[-376.58,146.11],[-381.32,139.66],[-386.04,133.2],[-390.77,126.75],[-395.48,120.27],[-400.21,113.82],[-404.95,107.37],[-409.7,100.93],[-414.44,94.49],[-419.21,88.06],[-423.95,81.61],[-428.7,75.17],[-433.46,68.74],[-438.22,62.31],[-442.99,55.89],[-447.78,49.47],[-452.53,43.03],[-457.27,36.59],[-462.02,30.14],[-466.73,23.67],[-471.37,17.16],[-475.99,10.62],[-480.53,4.03],[-484.97,-2.63],[-489.3,-9.36],[-493.41,-16.22],[-497.2,-23.27],[-500.64,-30.49],[-503.76,-37.86],[-506.5,-45.38],[-508.84,-53.03],[-510.73,-60.8],[-511.91,-68.72],[-512.4,-76.7],[-512.32,-84.7],[-511.61,-92.67],[-510.33,-100.57],[-508.48,-108.35],[-505.93,-115.93],[-502.39,-123.1],[-497.91,-129.73],[-492.87,-135.94],[-487.24,-141.62],[-480.97,-146.59],[-474.4,-151.16],[-468.2,-156.21],[-462.86,-162.14],[-458.88,-169.07],[-456.2,-176.59],[-454.93,-184.48],[-455.01,-192.48],[-455.7,-200.45],[-456.93,-208.35],[-458.76,-216.14],[-461.34,-223.71],[-464.83,-230.9],[-469.36,-237.49],[-474.76,-243.39],[-480.99,-248.39],[-487.83,-252.53],[-494.8,-256.46],[-501.77,-260.4],[-508.58,-264.6],[-515.18,-269.13],[-521.46,-274.08],[-527.39,-279.45],[-532.8,-285.34],[-537.57,-291.76],[-541.4,-298.77],[-544.06,-306.31],[-545.64,-314.14],[-545.81,-322.13],[-544.55,-330.02],[-541.77,-337.5],[-537.85,-344.47],[-533.28,-351.04],[-528.18,-357.2],[-522.73,-363.06],[-517.24,-368.88],[-511.6,-374.56],[-505.92,-380.2],[-500.12,-385.71],[-494.31,-391.21],[-488.31,-396.51],[-482.02,-401.45],[-475.28,-405.75],[-468.05,-409.17],[-460.46,-411.71],[-452.63,-413.29],[-444.65,-413.87],[-436.69,-413.13],[-428.93,-411.23],[-421.47,-408.36],[-414.3,-404.79],[-407.34,-400.85],[-400.24,-397.16],[-392.91,-393.96],[-385.33,-391.41],[-377.57,-389.45],[-369.71,-387.97],[-361.82,-386.64],[-353.96,-385.14],[-346.14,-383.42],[-338.38,-381.47],[-330.67,-379.35],[-323.06,-376.87],[-315.63,-373.89],[-308.48,-370.31],[-301.84,-365.86],[-295.97,-360.44],[-291.21,-354.02],[-287.85,-346.78],[-286.37,-338.94],[-287.05,-330.99],[-289.66,-323.47],[-293.55,-316.48],[-296.36,-309.01],[-297.17,-301.08],[-295.73,-293.24],[-292.13,-286.11],[-286.72,-280.26],[-280.01,-275.95],[-272.47,-273.31],[-264.57,-272.12],[-256.57,-272.2],[-248.58,-272.66],[-240.6,-273.14],[-232.59,-273.17],[-224.59,-272.97],[-216.59,-272.91],[-208.59,-273.07],[-200.62,-273.76],[-192.74,-275.11],[-185.07,-277.38],[-177.75,-280.58],[-170.95,-284.78],[-164.88,-289.99],[-159.65,-296.04],[-155.24,-302.71],[-151.7,-309.88],[-148.85,-317.35],[-146.62,-325.03],[-145.2,-332.9],[-144.66,-340.89],[-144.75,-348.89],[-145.31,-356.87],[-145.93,-364.85],[-146.06,-372.85],[-145.37,-380.81],[-143.61,-388.61],[-140.65,-396.03],[-136.56,-402.89],[-131.34,-408.94],[-125.2,-414.06],[-118.31,-418.1],[-110.96,-421.26],[-103.29,-423.53],[-95.43,-425.01],[-87.46,-425.63],[-79.46,-425.6],[-71.48,-424.99],[-63.55,-423.91],[-55.69,-422.43],[-47.89,-420.64],[-40.14,-418.65],[-32.43,-416.48],[-24.78,-414.15],[-17.18,-411.65],[-9.62,-409],[-2.1,-406.27],[5.4,-403.5],[12.91,-400.71],[20.38,-397.84],[27.83,-394.94],[35.29,-392.04],[42.74,-389.12],[50.19,-386.19],[57.63,-383.25],[65.07,-380.29],[72.51,-377.36],[79.96,-374.44],[87.41,-371.51],[94.86,-368.59],[102.3,-365.64],[109.73,-362.66],[117.15,-359.66],[124.56,-356.64],[131.95,-353.59],[139.35,-350.53],[146.74,-347.47],[154.14,-344.42],[161.54,-341.38],[168.95,-338.34],[176.35,-335.29],[183.75,-332.25],[191.16,-329.22],[198.56,-326.2],[205.98,-323.18],[213.39,-320.17],[220.8,-317.15],[228.2,-314.11],[235.63,-311.12],[243.04,-308.12],[250.45,-305.09],[257.85,-302.03],[265.26,-299.01],[272.66,-295.97],[280.08,-292.98]],elevation:[4.4,4.42,4.43,4.44,4.46,4.47,4.49,4.5,4.52,4.53,4.55,4.56,4.58,4.59,4.61,4.63,4.64,4.66,4.68,4.69,4.71,4.72,4.74,4.75,4.76,4.77,4.79,4.8,4.81,4.82,4.83,4.84,4.85,4.86,4.87,4.87,4.88,4.89,4.89,4.89,4.87,4.86,4.85,4.83,4.82,4.8,4.78,4.76,4.75,4.73,4.71,4.68,4.65,4.61,4.58,4.56,4.53,4.5,4.47,4.44,4.44,4.45,4.47,4.5,4.53,4.55,4.55,4.53,4.51,4.5,4.5,4.51,4.52,4.53,4.54,4.55,4.57,4.6,4.64,4.69,4.74,4.79,4.84,4.88,4.89,4.9,4.89,4.89,4.9,4.91,4.94,4.97,5.01,5.06,5.12,5.19,5.27,5.33,5.35,5.36,5.33,5.29,5.26,5.23,5.2,5.17,5.15,5.12,5.07,5.02,4.97,4.91,4.84,4.77,4.7,4.63,4.59,4.58,4.59,4.6,4.61,4.62,4.63,4.64,4.65,4.67,4.68,4.7,4.72,4.73,4.74,4.73,4.71,4.68,4.65,4.61,4.58,4.54,4.5,4.46,4.42,4.38,4.36,4.34,4.33,4.31,4.28,4.25,4.2,4.15,4.07,3.99,3.9,3.83,3.77,3.71,3.67,3.62,3.59,3.58,3.58,3.59,3.6,3.6,3.6,3.6,3.59,3.58,3.55,3.53,3.5,3.46,3.44,3.43,3.44,3.47,3.5,3.52,3.54,3.55,3.56,3.56,3.56,3.56,3.56,3.56,3.56,3.57,3.58,3.59,3.6,3.61,3.63,3.64,3.64,3.65,3.64,3.63,3.61,3.59,3.57,3.56,3.54,3.51,3.48,3.45,3.41,3.37,3.33,3.28,3.24,3.21,3.17,3.14,3.1,3.07,3.02,2.96,2.89,2.8,2.7,2.61,2.52,2.44,2.37,2.29,2.21,2.14,2.07,2.01,1.94,1.88,1.84,1.8,1.79,1.8,1.82,1.86,1.91,1.96,2.01,2.05,2.09,2.13,2.16,2.19,2.23,2.26,2.29,2.31,2.31,2.3,2.29,2.29,2.3,2.34,2.4,2.48,2.58,2.67,2.76,2.84,2.92,3,3.07,3.13,3.17,3.2,3.24,3.27,3.28,3.29,3.29,3.29,3.3,3.32,3.34,3.36,3.38,3.42,3.47,3.53,3.59,3.65,3.71,3.78,3.88,3.98,4.05,4.06,4.05,4.04,4.03,4,3.95,3.9,3.83,3.75,3.67,3.58,3.49,3.41,3.32,3.24,3.17,3.1,3.03,2.97,2.92,2.87,2.83,2.79,2.76,2.73,2.71,2.69,2.67,2.65,2.63,2.61,2.6,2.59,2.58,2.56,2.55,2.54,2.53,2.51,2.49,2.47,2.45,2.42,2.4,2.38,2.35,2.32,2.29,2.26,2.23,2.21,2.19,2.17,2.16,2.15,2.14,2.14,2.14,2.14,2.13,2.13,2.13,2.13,2.14,2.15,2.17,2.19,2.22,2.26,2.3,2.34,2.38,2.42,2.47,2.51,2.55,2.58,2.6,2.62,2.63,2.63,2.63,2.62,2.61,2.59,2.56,2.53,2.5,2.46,2.43,2.39,2.35,2.3,2.25,2.2,2.15,2.1,2.05,2,1.94,1.89,1.83,1.78,1.73,1.68,1.63,1.58,1.53,1.48,1.44,1.4,1.36,1.32,1.28,1.24,1.21,1.18,1.16,1.13,1.11,1.08,1.07,1.06,1.05,1.04,1.02,1,.98,.96,.94,.92,.91,.9,.9,.89,.88,.87,.85,.84,.82,.81,.79,.77,.75,.74,.73,.72,.71,.7,.68,.67,.66,.65,.64,.62,.61,.59,.58,.56,.55,.54,.53,.52,.5,.49,.47,.46,.46,.46,.45,.44,.42,.4,.39,.39,.4,.4,.4,.41,.42,.42,.41,.39,.37,.37,.37,.37,.37,.36,.36,.35,.34,.33,.33,.33,.31,.3,.29,.28,.27,.25,.24,.23,.22,.22,.21,.2,.19,.17,.15,.13,.11,.09,.06,.04,.01,0,.01,.03,.06,.08,.1,.11,.12,.13,.14,.17,.22,.3,.4,.48,.53,.54,.53,.5,.48,.47,.48,.51,.53,.56,.58,.61,.65,.71,.8,.9,1.02,1.15,1.26,1.36,1.43,1.5,1.57,1.67,1.78,1.91,2.03,2.13,2.22,2.31,2.39,2.46,2.53,2.57,2.6,2.61,2.62,2.62,2.63,2.62,2.62,2.61,2.61,2.61,2.62,2.63,2.62,2.58,2.51,2.4,2.3,2.2,2.12,2.04,1.97,1.9,1.84,1.78,1.73,1.69,1.65,1.61,1.57,1.54,1.51,1.49,1.46,1.45,1.43,1.42,1.41,1.41,1.42,1.43,1.43,1.41,1.38,1.34,1.3,1.27,1.26,1.27,1.27,1.28,1.29,1.28,1.25,1.2,1.12,1.02,.9,.78,.67,.58,.49,.42,.35,.29,.24,.18,.13,.1,.08,.08,.09,.11,.14,.17,.21,.27,.34,.42,.5,.55,.59,.61,.64,.69,.77,.87,.96,1.04,1.12,1.2,1.27,1.33,1.39,1.45,1.53,1.6,1.66,1.69,1.7,1.67,1.63,1.58,1.54,1.53,1.53,1.55,1.57,1.57,1.55,1.54,1.54,1.56,1.58,1.6,1.6,1.6,1.6,1.62,1.65,1.68,1.7,1.7,1.69,1.65,1.58,1.47,1.36,1.25,1.15,1.07,1,.95,.92,.93,.97,1.04,1.1,1.17,1.24,1.31,1.38,1.47,1.59,1.75,1.94,2.13,2.28,2.4,2.51,2.61,2.72,2.81,2.89,2.96,3.02,3.08,3.13,3.17,3.21,3.24,3.27,3.29,3.32,3.33,3.35,3.37,3.38,3.4,3.42,3.45,3.47,3.49,3.51,3.53,3.55,3.56,3.58,3.6,3.61,3.63,3.65,3.67,3.69,3.7,3.71,3.72,3.73,3.74,3.76,3.77,3.79,3.81,3.83,3.84,3.86,3.87,3.89,3.9,3.92,3.93,3.94,3.95,3.97,3.99,4.01,4.03,4.05,4.07,4.09,4.1,4.11,4.13,4.14,4.15,4.17,4.18,4.19,4.2,4.22,4.23,4.24,4.25,4.26,4.28,4.29,4.3,4.31,4.33,4.34,4.35,4.36,4.38,4.39],elevationSource:`USGS 3DEP`},{id:`shenandoah`,name:`Shenandoah`,venueName:`Summit Point Motorsport Park`,configName:`Shenandoah Circuit`,location:{city:`Summit Point`,state:`WV`,country:`US`,lat:39.2421168,lon:-77.9807078},width:15,coneSpacing:10,points:[[160.52,159.19],[164.85,152.45],[169.17,145.7],[173.43,138.92],[177.63,132.1],[181.76,125.23],[185.83,118.34],[189.82,111.39],[193.7,104.39],[197.49,97.33],[201.21,90.24],[204.81,83.08],[208.35,75.9],[211.79,68.66],[215.19,61.41],[218.54,54.13],[221.83,46.83],[225.08,39.51],[228.27,32.16],[231.44,24.8],[234.58,17.43],[237.69,10.06],[240.78,2.66],[243.86,-4.73],[246.9,-12.14],[249.94,-19.55],[252.97,-26.97],[255.99,-34.38],[259,-41.81],[262.01,-49.23],[265.06,-56.64],[268.1,-64.05],[271.17,-71.45],[274.28,-78.83],[277.39,-86.21],[280.47,-93.6],[283.57,-100.99],[286.65,-108.38],[289.72,-115.78],[292.78,-123.19],[295.8,-130.6],[298.77,-138.04],[301.56,-145.55],[304.1,-153.15],[306.24,-160.86],[307.79,-168.72],[308.77,-176.66],[308.9,-184.67],[307.86,-192.6],[305.73,-200.31],[302.28,-207.52],[297.18,-213.67],[290.9,-218.62],[283.76,-222.23],[276.1,-224.52],[268.15,-225.3],[260.21,-224.4],[252.65,-221.81],[245.68,-217.89],[239.41,-212.92],[233.71,-207.29],[228.5,-201.21],[223.86,-194.68],[219.71,-187.83],[215.95,-180.76],[212.51,-173.53],[209.31,-166.19],[206.37,-158.74],[203.6,-151.22],[200.91,-143.68],[198.25,-136.12],[195.61,-128.56],[192.99,-120.99],[190.35,-113.43],[187.64,-105.89],[184.91,-98.36],[182.14,-90.84],[179.35,-83.34],[176.56,-75.83],[173.74,-68.33],[170.87,-60.85],[167.72,-53.49],[163.7,-46.57],[158.6,-40.41],[152.47,-35.28],[145.23,-31.94],[137.29,-31.25],[129.58,-33.37],[122.75,-37.5],[117.76,-43.72],[114.82,-51.15],[113.08,-58.96],[112.16,-66.92],[112.11,-74.92],[113,-82.88],[114.74,-90.69],[117.47,-98.21],[121.29,-105.25],[125.91,-111.78],[131.06,-117.92],[136.61,-123.7],[142.4,-129.23],[148.3,-134.65],[154.09,-140.18],[159.45,-146.13],[164.08,-152.66],[167.92,-159.68],[170.75,-167.16],[172.44,-174.99],[173.25,-182.95],[172.66,-190.92],[170.25,-198.55],[166.65,-205.68],[161.78,-212.03],[156.07,-217.64],[149.72,-222.51],[142.75,-226.45],[135.45,-229.73],[127.84,-232.22],[120.1,-234.3],[112.24,-235.79],[104.29,-236.81],[96.32,-237.57],[88.33,-238.12],[80.33,-238.44],[72.32,-238.61],[64.31,-238.72],[56.3,-238.72],[48.29,-238.7],[40.28,-238.68],[32.27,-238.73],[24.26,-238.83],[16.25,-238.95],[8.24,-239.2],[.24,-239.42],[-7.77,-239.73],[-15.77,-240.08],[-23.77,-240.51],[-31.76,-240.97],[-39.76,-241.38],[-47.76,-241.84],[-55.76,-242.31],[-63.75,-242.84],[-71.74,-243.38],[-79.74,-243.85],[-87.74,-244.04],[-95.74,-243.74],[-103.65,-242.49],[-111.31,-240.19],[-118.31,-236.31],[-124.43,-231.17],[-129.61,-225.07],[-133.68,-218.18],[-136.49,-210.7],[-137.83,-202.83],[-137.12,-194.87],[-134.73,-187.25],[-130.74,-180.31],[-125.55,-174.22],[-119.26,-169.29],[-112.13,-165.68],[-104.42,-163.54],[-96.44,-163.01],[-88.49,-163.88],[-80.84,-166.22],[-73.81,-170.03],[-67.3,-174.69],[-61.03,-179.68],[-54.54,-184.37],[-47.64,-188.42],[-40.28,-191.57],[-32.62,-193.9],[-24.79,-195.6],[-16.88,-196.81],[-8.93,-197.77],[-.94,-198.34],[7.06,-198.83],[15.06,-199.25],[23.06,-199.65],[31.06,-199.96],[39.07,-200.15],[47.07,-199.87],[54.99,-198.69],[62.69,-196.54],[69.71,-192.71],[75.62,-187.34],[79.89,-180.58],[82.73,-173.1],[84.19,-165.24],[84.2,-157.24],[82.92,-149.34],[80.54,-141.7],[77.41,-134.33],[73.64,-127.26],[69.46,-120.43],[64.89,-113.85],[60.03,-107.49],[55.05,-101.21],[50.04,-94.96],[45.05,-88.69],[40.12,-82.39],[35.28,-76],[30.5,-69.58],[25.8,-63.08],[21.23,-56.51],[16.74,-49.88],[12.29,-43.21],[7.9,-36.52],[3.54,-29.8],[-.82,-23.08],[-5.18,-16.36],[-9.56,-9.65],[-14.01,-2.99],[-18.54,3.62],[-23.2,10.13],[-28.02,16.53],[-33,22.8],[-38.19,28.9],[-43.67,34.74],[-49.38,40.36],[-55.27,45.78],[-61.35,50.99],[-67.63,55.97],[-74.04,60.77],[-80.6,65.37],[-87.26,69.81],[-94.02,74.12],[-100.79,78.4],[-107.57,82.66],[-114.42,86.82],[-121.32,90.88],[-128.23,94.93],[-135.15,98.97],[-142,103.11],[-148.82,107.32],[-155.62,111.56],[-162.39,115.84],[-169.17,120.1],[-175.91,124.43],[-182.62,128.79],[-189.32,133.19],[-195.99,137.62],[-202.66,142.07],[-209.35,146.46],[-216.07,150.82],[-222.76,155.23],[-229.4,159.71],[-236.03,164.2],[-242.6,168.78],[-249.13,173.42],[-255.65,178.07],[-262.19,182.71],[-268.7,187.37],[-275.18,192.08],[-281.64,196.81],[-288.12,201.52],[-294.63,206.19],[-301.15,210.84],[-307.66,215.51],[-314.13,220.24],[-320.57,225],[-326.94,229.85],[-333.2,234.85],[-339.16,240.19],[-344.63,246.04],[-349.53,252.38],[-353.67,259.22],[-356.85,266.56],[-358.91,274.3],[-359.6,282.26],[-358.5,290.18],[-355.72,297.67],[-351.25,304.3],[-345.34,309.66],[-338.22,313.28],[-330.52,315.44],[-322.56,315.34],[-314.84,313.29],[-307.65,309.79],[-301.81,304.36],[-297.34,297.74],[-293.91,290.5],[-291.07,283.01],[-288.53,275.42],[-285.9,267.85],[-282.81,260.47],[-279.19,253.32],[-274.9,246.56],[-269.91,240.3],[-264.34,234.55],[-258.27,229.33],[-251.77,224.66],[-244.9,220.53],[-237.71,217.01],[-230.28,214.03],[-222.75,211.31],[-215.17,208.72],[-207.54,206.27],[-199.87,203.95],[-192.33,201.27],[-185.17,197.69],[-178.62,193.1],[-172.96,187.44],[-167.99,181.17],[-163.51,174.53],[-159.06,167.87],[-154.16,161.54],[-148.39,156.02],[-141.27,152.39],[-133.46,150.78],[-125.61,152.19],[-118.76,156.24],[-114.07,162.62],[-112.33,170.39],[-112.65,178.39],[-113.73,186.32],[-115.04,194.22],[-115.97,202.18],[-116.14,210.18],[-115.38,218.15],[-113.48,225.93],[-110.34,233.28],[-106.23,240.16],[-101.24,246.41],[-95.59,252.09],[-89.4,257.17],[-82.93,261.88],[-76.21,266.24],[-69.25,270.2],[-62.18,273.98],[-55.03,277.58],[-47.78,280.98],[-40.42,284.14],[-32.93,286.99],[-25.32,289.48],[-17.56,291.47],[-9.73,293.12],[-1.78,294.13],[6.21,294.63],[14.22,294.53],[22.18,293.75],[30.09,292.47],[37.88,290.62],[45.51,288.18],[52.91,285.13],[60.09,281.57],[67.01,277.54],[73.64,273.06],[79.99,268.18],[86.09,262.99],[91.91,257.49],[97.5,251.75],[102.81,245.76],[107.9,239.57],[112.78,233.22],[117.43,226.7],[121.99,220.11],[126.43,213.44],[130.78,206.72],[135.06,199.95],[139.32,193.16],[143.55,186.37],[147.79,179.57],[152.02,172.77],[156.24,165.96]],elevation:[.77,.66,.55,.46,.37,.29,.21,.15,.1,.05,.02,.01,0,.01,.03,.07,.12,.2,.28,.39,.51,.65,.8,.96,1.12,1.28,1.45,1.6,1.75,1.89,2.03,2.16,2.29,2.42,2.53,2.62,2.68,2.71,2.72,2.7,2.66,2.62,2.57,2.52,2.46,2.41,2.37,2.34,2.32,2.32,2.33,2.36,2.4,2.46,2.52,2.6,2.7,2.81,2.92,3.04,3.16,3.28,3.4,3.52,3.64,3.76,3.89,4.01,4.14,4.27,4.41,4.54,4.68,4.81,4.93,5.01,5.08,5.1,5.11,5.1,5.08,5.07,5.08,5.1,5.12,5.15,5.17,5.18,5.18,5.16,5.14,5.11,5.06,5.02,4.98,4.95,4.92,4.9,4.88,4.85,4.82,4.79,4.76,4.72,4.67,4.62,4.57,4.5,4.43,4.36,4.28,4.21,4.13,4.05,3.98,3.91,3.84,3.77,3.7,3.64,3.6,3.58,3.57,3.6,3.64,3.71,3.78,3.85,3.9,3.91,3.88,3.78,3.62,3.4,3.15,2.88,2.61,2.35,2.11,1.9,1.71,1.56,1.45,1.39,1.36,1.36,1.36,1.37,1.39,1.4,1.42,1.43,1.44,1.45,1.46,1.48,1.51,1.59,1.69,1.84,2.03,2.26,2.5,2.76,3.02,3.29,3.56,3.82,4.06,4.28,4.46,4.6,4.7,4.76,4.78,4.77,4.74,4.69,4.63,4.55,4.46,4.36,4.25,4.14,4.02,3.91,3.8,3.71,3.63,3.56,3.48,3.4,3.32,3.23,3.13,3.05,2.96,2.89,2.82,2.76,2.72,2.69,2.67,2.67,2.66,2.66,2.67,2.68,2.68,2.7,2.71,2.73,2.76,2.8,2.85,2.9,2.97,3.04,3.12,3.2,3.29,3.37,3.44,3.52,3.6,3.68,3.76,3.84,3.92,3.99,4.06,4.12,4.18,4.24,4.3,4.36,4.43,4.52,4.64,4.77,4.91,5.06,5.21,5.36,5.49,5.63,5.76,5.9,6.05,6.21,6.38,6.55,6.72,6.88,7.03,7.14,7.21,7.22,7.16,7,6.76,6.43,6.03,5.57,5.09,4.62,4.2,3.83,3.55,3.34,3.19,3.09,3.01,2.94,2.87,2.79,2.71,2.61,2.52,2.43,2.35,2.27,2.21,2.17,2.13,2.1,2.09,2.08,2.08,2.08,2.1,2.12,2.14,2.17,2.22,2.28,2.36,2.45,2.55,2.63,2.68,2.71,2.71,2.7,2.69,2.68,2.66,2.64,2.6,2.55,2.48,2.39,2.29,2.19,2.1,2.02,1.96,1.91,1.88,1.87,1.86,1.87,1.9,1.94,2.02,2.12,2.26,2.42,2.61,2.8,3.01,3.23,3.44,3.64,3.83,4,4.16,4.31,4.44,4.57,4.68,4.77,4.86,4.94,5.02,5.1,5.17,5.26,5.35,5.47,5.6,5.75,5.92,6.09,6.28,6.47,6.66,6.86,7.06,7.27,7.49,7.71,7.92,8.12,8.31,8.49,8.67,8.87,9.07,9.28,9.5,9.73,9.98,10.25,10.55,10.85,11.17,11.47,11.74,11.98,12.16,12.3,12.39,12.43,12.42,12.38,12.27,12.11,11.89,11.62,11.31,10.98,10.63,10.28,9.93,9.6,9.28,9,8.75,8.53,8.35,8.21,8.1,8.04,8.02,8.06,8.15,8.28,8.45,8.64,8.82,9,9.16,9.31,9.46,9.6,9.72,9.83,9.93,10.01,10.07,10.11,10.12,10.1,10.03,9.93,9.8,9.68,9.56,9.45,9.36,9.26,9.15,9.03,8.9,8.77,8.63,8.49,8.34,8.19,8.02,7.86,7.68,7.51,7.34,7.19,7.05,6.93,6.81,6.7,6.6,6.51,6.44,6.38,6.33,6.29,6.27,6.29,6.35,6.44,6.58,6.74,6.93,7.15,7.39,7.64,7.92,8.21,8.52,8.83,9.14,9.42,9.67,9.86,10,10.1,10.17,10.23,10.3,10.38,10.48,10.61,10.75,10.9,11.06,11.21,11.34,11.46,11.55,11.6,11.58,11.49,11.32,11.07,10.76,10.41,10.05,9.7,9.38,9.1,8.87,8.68,8.51,8.35,8.18,7.99,7.8,7.6,7.38,7.15,6.89,6.6,6.29,5.96,5.62,5.28,4.94,4.62,4.32,4.06,3.83,3.65,3.52,3.43,3.39,3.39,3.42,3.46,3.52,3.6,3.69,3.79,3.89,4,4.09,4.16,4.2,4.23,4.23,4.22,4.2,4.17,4.13,4.08,4.01,3.94,3.87,3.8,3.74,3.7,3.66,3.62,3.6,3.57,3.54,3.51,3.49,3.47,3.45,3.42,3.38,3.33,3.27,3.2,3.13,3.05,2.97,2.89,2.8,2.71,2.6,2.49,2.38,2.26,2.14,2.01,1.89,1.76,1.63,1.5,1.37,1.24,1.12,1,.88],elevationSource:`USGS 3DEP`},{id:`sonoma-raceway`,name:`Sonoma Raceway`,venueName:`Sonoma Raceway`,configName:`Full Course`,location:{city:`Sonoma`,state:`CA`,country:`US`,lat:38.162615,lon:-122.457631},width:15,coneSpacing:10,points:[[-340.23,-180.1],[-334.05,-175.02],[-327.85,-169.97],[-321.61,-164.96],[-315.34,-159.99],[-309.06,-155.04],[-302.77,-150.09],[-296.48,-145.15],[-290.17,-140.24],[-283.84,-135.35],[-277.49,-130.49],[-271.11,-125.66],[-264.66,-120.92],[-258.08,-116.38],[-251.29,-112.15],[-244.27,-108.33],[-237.06,-104.86],[-229.69,-101.75],[-222.18,-98.98],[-214.59,-96.47],[-206.91,-94.24],[-199.15,-92.28],[-191.33,-90.63],[-183.44,-89.28],[-175.53,-88.15],[-167.57,-87.32],[-159.59,-86.74],[-151.6,-86.43],[-143.6,-86.36],[-135.6,-86.6],[-127.62,-87.12],[-119.66,-87.88],[-111.71,-88.8],[-103.8,-90],[-95.95,-91.52],[-88.17,-93.38],[-80.5,-95.65],[-72.99,-98.39],[-65.65,-101.57],[-58.53,-105.22],[-51.63,-109.26],[-44.94,-113.64],[-38.5,-118.39],[-32.32,-123.46],[-26.45,-128.9],[-20.93,-134.68],[-15.65,-140.7],[-10.67,-146.96],[-5.86,-153.35],[-1.24,-159.88],[3.18,-166.54],[7.39,-173.34],[11.49,-180.21],[15.79,-186.95],[20.78,-193.19],[26.73,-198.53],[33.45,-202.86],[40.69,-206.25],[48.33,-208.58],[56.23,-209.82],[64.22,-210.1],[72.2,-209.6],[80.07,-208.21],[87.72,-205.87],[95.13,-202.87],[102.25,-199.24],[109.09,-195.1],[115.69,-190.57],[122.01,-185.67],[128.05,-180.42],[133.84,-174.91],[139.43,-169.18],[144.82,-163.28],[150.09,-157.25],[155.27,-151.16],[160.41,-145.03],[165.57,-138.92],[170.71,-132.79],[175.83,-126.64],[180.91,-120.46],[185.95,-114.25],[190.99,-108.04],[196.02,-101.82],[201.02,-95.57],[205.95,-89.28],[210.78,-82.9],[215.57,-76.49],[220.32,-70.06],[225.27,-63.77],[230.62,-57.83],[236.6,-52.52],[243.24,-48.07],[250.43,-44.58],[258.02,-42.08],[265.8,-40.25],[273.74,-39.32],[281.74,-39.09],[289.73,-39.24],[297.73,-39.57],[305.72,-39.74],[313.72,-39.48],[321.66,-38.55],[329.46,-36.8],[337.03,-34.23],[344.31,-30.92],[351.23,-26.92],[357.83,-22.41],[364.15,-17.5],[370.09,-12.15],[375.66,-6.41],[380.96,-.41],[386.1,5.71],[391.14,11.92],[396.05,18.24],[400.74,24.72],[405.25,31.33],[409.65,38.01],[414.05,44.69],[418.5,51.33],[422.93,58],[427.37,64.65],[431.75,71.34],[436.11,78.05],[440.5,84.74],[444.79,91.49],[448.46,98.59],[451.09,106.14],[452.21,114.04],[451.78,122.01],[449.97,129.79],[446.82,137.14],[442.54,143.88],[437.26,149.87],[431.05,154.9],[424.19,159],[416.96,162.42],[409.49,165.28],[401.85,167.64],[394.09,169.6],[386.28,171.33],[378.47,173.02],[370.63,174.65],[362.78,176.19],[354.91,177.58],[346.99,178.71],[339.02,179.37],[331.02,179.66],[323.03,179.49],[315.05,178.87],[307.12,177.82],[299.24,176.44],[291.44,174.69],[283.74,172.53],[276.18,169.93],[268.73,167.01],[261.48,163.64],[254.42,159.87],[247.56,155.76],[240.92,151.31],[234.47,146.57],[228.22,141.58],[222.25,136.26],[216.58,130.62],[211.21,124.69],[206.09,118.55],[201.18,112.23],[196.48,105.76],[191.99,99.14],[187.64,92.42],[183.42,85.63],[179.27,78.79],[175.09,71.97],[170.88,65.17],[166.65,58.38],[162.4,51.6],[158.13,44.84],[153.9,38.05],[149.69,31.24],[145.5,24.43],[141.29,17.63],[136.99,10.88],[132.67,4.15],[128.15,-2.45],[123.31,-8.81],[118.01,-14.8],[112.13,-20.23],[105.7,-24.97],[98.75,-28.92],[91.38,-32.03],[83.75,-34.42],[75.9,-35.93],[67.92,-36.47],[59.94,-36.17],[52.04,-34.91],[44.29,-32.95],[36.71,-30.4],[29.4,-27.16],[22.41,-23.27],[15.82,-18.75],[9.68,-13.63],[4.25,-7.76],[-.53,-1.35],[-4.71,5.47],[-8.23,12.64],[-11.1,20.11],[-13.22,27.82],[-14.65,35.69],[-15.25,43.66],[-15.08,51.66],[-14.13,59.6],[-12.52,67.43],[-10.36,75.13],[-7.71,82.68],[-4.63,90.06],[-1.04,97.2],[3.03,104.09],[7.46,110.75],[12.21,117.18],[17.28,123.37],[22.61,129.33],[28.17,135.09],[33.94,140.63],[39.89,145.97],[46.02,151.11],[52.22,156.16],[58.5,161.11],[64.86,165.97],[71.3,170.72],[77.78,175.41],[84.29,180.05],[90.83,184.66],[97.41,189.22],[104.03,193.7],[110.7,198.11],[117.43,202.44],[124.21,206.69],[131.04,210.84],[137.95,214.89],[144.92,218.8],[151.97,222.59],[159.06,226.29],[166.18,229.94],[173.31,233.57],[180.44,237.19],[187.59,240.78],[194.74,244.37],[201.89,247.95],[209.04,251.53],[216.19,255.13],[223.33,258.73],[230.47,262.34],[237.58,266],[244.72,269.62],[251.83,273.28],[258.97,276.88],[266.12,280.47],[273.29,284.02],[280.45,287.59],[287.62,291.14],[294.79,294.68],[301.98,298.2],[309.15,301.73],[316.32,305.28],[323.48,308.86],[330.64,312.42],[337.81,315.96],[344.97,319.53],[352.1,323.16],[359.13,326.98],[365.81,331.37],[371.72,336.75],[376.5,343.14],[379.76,350.42],[381.04,358.3],[380.57,366.27],[378.7,374.03],[375.29,381.26],[370.6,387.72],[364.79,393.2],[358.14,397.63],[350.75,400.63],[342.94,402.31],[334.96,402.68],[327,401.89],[319.23,400.05],[311.73,397.27],[304.52,393.82],[297.69,389.64],[291.28,384.87],[285.27,379.59],[279.57,373.98],[273.98,368.26],[268.34,362.58],[262.6,357.01],[256.74,351.57],[250.69,346.33],[244.42,341.38],[237.99,336.61],[231.44,332.03],[224.79,327.58],[218.04,323.29],[211.07,319.35],[203.94,315.74],[196.73,312.26],[189.5,308.85],[182.33,305.29],[175.26,301.56],[168.34,297.54],[161.62,293.22],[155.08,288.61],[148.72,283.76],[142.56,278.65],[136.56,273.36],[130.65,267.98],[124.73,262.59],[118.78,257.25],[112.8,251.93],[106.66,246.81],[100.26,242.01],[93.54,237.67],[86.56,233.76],[79.32,230.38],[71.87,227.47],[64.26,224.99],[56.52,222.97],[48.69,221.34],[40.8,220.06],[32.84,219.23],[24.87,218.51],[16.91,217.79],[8.95,216.94],[1.03,215.81],[-6.8,214.23],[-14.52,212.13],[-22.05,209.43],[-29.33,206.13],[-36.33,202.25],[-43.07,197.95],[-49.48,193.17],[-55.59,188.01],[-61.44,182.56],[-67.05,176.85],[-72.42,170.92],[-77.54,164.78],[-82.45,158.46],[-87.14,151.98],[-91.6,145.34],[-95.89,138.59],[-100.05,131.76],[-104.04,124.83],[-107.91,117.83],[-111.74,110.8],[-115.61,103.8],[-119.58,96.85],[-123.68,89.99],[-127.94,83.22],[-132.34,76.54],[-136.93,69.98],[-141.71,63.57],[-146.63,57.27],[-151.72,51.09],[-156.98,45.06],[-162.39,39.18],[-167.94,33.41],[-173.64,27.8],[-179.5,22.36],[-185.52,17.09],[-191.69,12],[-197.96,7.03],[-204.32,2.19],[-210.74,-2.59],[-217.25,-7.25],[-223.86,-11.75],[-230.58,-16.08],[-237.41,-20.25],[-244.37,-24.18],[-251.43,-27.95],[-258.6,-31.5],[-265.85,-34.88],[-273.18,-38.07],[-280.6,-41.07],[-288.11,-43.84],[-295.67,-46.44],[-303.29,-48.87],[-310.93,-51.23],[-318.62,-53.45],[-326.34,-55.54],[-334.09,-57.51],[-341.88,-59.35],[-349.69,-61.05],[-357.53,-62.68],[-365.34,-64.39],[-373.08,-66.4],[-380.73,-68.76],[-388.2,-71.6],[-395.49,-74.9],[-402.51,-78.72],[-409.21,-83.08],[-415.63,-87.86],[-421.76,-92.99],[-427.59,-98.47],[-433.08,-104.29],[-438.28,-110.36],[-443.2,-116.67],[-447.78,-123.23],[-452.1,-129.96],[-456.2,-136.83],[-459.99,-143.87],[-463.57,-151.03],[-466.92,-158.29],[-470.07,-165.64],[-473.07,-173.06],[-475.93,-180.53],[-478.68,-188.04],[-481.31,-195.6],[-483.87,-203.18],[-486.35,-210.78],[-488.73,-218.42],[-491.01,-226.08],[-493.22,-233.77],[-495.38,-241.48],[-497.6,-249.16],[-499.82,-256.85],[-502.05,-264.53],[-504.29,-272.21],[-506.51,-279.89],[-508.7,-287.59],[-510.89,-295.28],[-513.11,-302.97],[-515.41,-310.63],[-517.77,-318.27],[-520.16,-325.9],[-522.59,-333.53],[-525.05,-341.14],[-527.52,-348.75],[-530.04,-356.34],[-532.55,-363.94],[-535.05,-371.53],[-537.53,-379.14],[-540.02,-386.74],[-542.49,-394.35],[-545.04,-401.93],[-547.59,-409.51],[-550.14,-417.1],[-552.6,-424.71],[-554.89,-432.37],[-556.83,-440.13],[-557.27,-448.1],[-555.81,-455.94],[-552.34,-463.12],[-546.86,-468.9],[-539.94,-472.85],[-532.16,-474.6],[-524.18,-474.29],[-516.53,-472.04],[-509.48,-468.28],[-503.28,-463.24],[-498.09,-457.18],[-493.72,-450.48],[-490.33,-443.24],[-487.86,-435.64],[-486.03,-427.85],[-484.51,-420],[-483.07,-412.13],[-481.58,-404.27],[-480,-396.43],[-478.25,-388.63],[-476.42,-380.84],[-474.55,-373.06],[-472.54,-365.32],[-470.38,-357.62],[-468.11,-349.94],[-465.62,-342.34],[-462.89,-334.82],[-459.93,-327.39],[-456.74,-320.06],[-453.38,-312.8],[-449.88,-305.6],[-446.21,-298.49],[-442.35,-291.49],[-438.28,-284.61],[-434.04,-277.82],[-429.65,-271.14],[-425.05,-264.59],[-420.27,-258.18],[-415.26,-251.94],[-410.14,-245.8],[-404.91,-239.74],[-399.23,-234.12],[-393.33,-228.72],[-387.43,-223.32],[-381.53,-217.92],[-375.63,-212.51],[-369.73,-207.11],[-363.83,-201.71],[-357.93,-196.31],[-352.03,-190.91],[-346.13,-185.5]],elevation:[1.43,1.47,1.52,1.56,1.61,1.66,1.7,1.75,1.79,1.84,1.88,1.93,1.97,2.02,2.06,2.1,2.14,2.18,2.22,2.26,2.3,2.33,2.37,2.4,2.43,2.47,2.5,2.53,2.57,2.61,2.66,2.71,2.77,2.84,2.91,2.99,3.08,3.17,3.28,3.4,3.53,3.69,3.87,4.07,4.3,4.55,4.82,5.1,5.4,5.71,6.01,6.33,6.64,6.96,7.28,7.61,7.95,8.3,8.68,9.1,9.55,10.05,10.61,11.21,11.86,12.55,13.26,13.98,14.72,15.47,16.23,17.01,17.79,18.6,19.42,20.25,21.09,21.93,22.76,23.58,24.37,25.14,25.9,26.65,27.39,28.14,28.88,29.63,30.37,31.11,31.82,32.49,33.13,33.71,34.24,34.69,35.08,35.4,35.66,35.87,36.06,36.24,36.42,36.6,36.79,36.97,37.15,37.32,37.49,37.65,37.81,37.96,38.1,38.23,38.35,38.44,38.52,38.57,38.6,38.61,38.61,38.58,38.54,38.48,38.41,38.33,38.25,38.16,38.07,37.98,37.88,37.78,37.67,37.55,37.41,37.25,37.06,36.86,36.66,36.48,36.33,36.22,36.16,36.16,36.21,36.34,36.55,36.86,37.24,37.72,38.24,38.81,39.41,40.04,40.68,41.33,41.98,42.63,43.28,43.91,44.53,45.14,45.73,46.29,46.82,47.32,47.78,48.19,48.55,48.85,49.11,49.3,49.46,49.55,49.6,49.58,49.5,49.34,49.12,48.83,48.49,48.08,47.63,47.14,46.62,46.08,45.54,45.01,44.5,44.02,43.57,43.16,42.79,42.44,42.11,41.8,41.5,41.2,40.91,40.61,40.3,39.98,39.64,39.28,38.9,38.49,38.04,37.56,37.06,36.53,36,35.46,34.92,34.38,33.82,33.24,32.64,32.02,31.38,30.74,30.09,29.46,28.85,28.28,27.77,27.32,26.93,26.61,26.34,26.11,25.9,25.7,25.49,25.29,25.08,24.87,24.67,24.46,24.25,24.04,23.83,23.61,23.38,23.15,22.93,22.7,22.46,22.23,22,21.78,21.57,21.39,21.22,21.08,20.97,20.89,20.84,20.83,20.84,20.89,20.98,21.1,21.25,21.44,21.66,21.91,22.19,22.5,22.83,23.17,23.51,23.86,24.19,24.51,24.8,25.05,25.27,25.45,25.59,25.69,25.75,25.76,25.74,25.69,25.6,25.48,25.32,25.13,24.91,24.66,24.38,24.07,23.74,23.38,23,22.58,22.14,21.68,21.22,20.76,20.3,19.84,19.38,18.9,18.4,17.87,17.32,16.76,16.19,15.63,15.07,14.52,13.99,13.46,12.94,12.42,11.9,11.38,10.86,10.33,9.8,9.27,8.74,8.21,7.69,7.18,6.7,6.27,5.89,5.58,5.34,5.19,5.11,5.1,5.15,5.25,5.37,5.52,5.66,5.8,5.94,6.07,6.21,6.36,6.51,6.67,6.84,7.03,7.22,7.42,7.62,7.84,8.05,8.27,8.5,8.73,8.97,9.21,9.45,9.7,9.95,10.19,10.44,10.69,10.94,11.19,11.44,11.69,11.94,12.18,12.43,12.68,12.92,13.16,13.41,13.65,13.89,14.13,14.37,14.61,14.84,15.07,15.3,15.52,15.74,15.96,16.18,16.4,16.63,16.85,17.07,17.29,17.52,17.74,17.96,18.18,18.41,18.64,18.88,19.12,19.37,19.63,19.9,20.17,20.44,20.71,20.98,21.25,21.53,21.82,22.12,22.42,22.72,23.03,23.34,23.64,23.93,24.22,24.5,24.77,25.03,25.28,25.53,25.76,25.98,26.19,26.38,26.57,26.74,26.89,27.04,27.19,27.32,27.43,27.53,27.61,27.67,27.7,27.72,27.73,27.72,27.71,27.69,27.67,27.63,27.59,27.55,27.49,27.43,27.37,27.3,27.24,27.17,27.1,27.02,26.92,26.8,26.66,26.51,26.35,26.2,26.04,25.89,25.74,25.59,25.43,25.26,25.1,24.93,24.77,24.61,24.45,24.28,24.11,23.93,23.74,23.54,23.34,23.12,22.9,22.68,22.46,22.25,22.04,21.84,21.64,21.44,21.25,21.05,20.85,20.64,20.43,20.22,20,19.79,19.58,19.37,19.18,18.99,18.81,18.65,18.49,18.35,18.21,18.07,17.93,17.8,17.66,17.52,17.38,17.24,17.09,16.94,16.78,16.62,16.44,16.26,16.06,15.85,15.64,15.41,15.18,14.95,14.72,14.49,14.26,14.03,13.8,13.59,13.38,13.19,13.01,12.86,12.73,12.63,12.55,12.49,12.46,12.43,12.41,12.4,12.39,12.38,12.37,12.36,12.35,12.32,12.28,12.22,12.14,12.04,11.92,11.77,11.6,11.39,11.16,10.89,10.59,10.27,9.93,9.57,9.21,8.85,8.49,8.14,7.79,7.47,7.16,6.88,6.62,6.4,6.2,6.03,5.89,5.78,5.68,5.6,5.52,5.46,5.39,5.32,5.26,5.2,5.14,5.08,5.02,4.95,4.89,4.82,4.75,4.68,4.6,4.53,4.45,4.36,4.28,4.19,4.09,4,3.9,3.79,3.69,3.6,3.5,3.42,3.33,3.25,3.17,3.09,3.01,2.93,2.84,2.76,2.68,2.59,2.51,2.42,2.34,2.25,2.16,2.08,2,1.92,1.83,1.75,1.67,1.59,1.51,1.43,1.35,1.28,1.21,1.14,1.08,1.03,.98,.94,.91,.88,.86,.84,.82,.81,.79,.78,.78,.77,.76,.75,.74,.72,.7,.68,.66,.64,.62,.6,.58,.55,.53,.51,.49,.47,.45,.44,.43,.41,.4,.39,.38,.37,.36,.35,.34,.33,.32,.32,.31,.3,.3,.28,.27,.23,.19,.13,.08,.03,0,0,.02,.07,.13,.19,.25,.31,.38,.45,.52,.59,.65,.71,.76,.8,.83,.86,.88,.9,.91,.92,.92,.93,.93,.94,.95,.96,.97,.97,.96,.95,.92,.89,.86,.83,.81,.81,.82,.83,.85,.88,.91,.93,.94,.95,.94,.91,.88,.83,.78,.73,.68,.63,.58,.54,.5,.47,.44,.42,.41,.4,.4,.4,.41,.42,.43,.44,.45,.45,.46,.47,.49,.51,.53,.55,.57,.59,.6,.61,.62,.62,.62,.62,.63,.65,.66,.68,.7,.71,.73,.75,.77,.8,.82,.85,.88,.91,.95,.98,1.02,1.05,1.09,1.13,1.17,1.21,1.25,1.3,1.34,1.38],elevationSource:`USGS 3DEP`},{id:`thunderhill-5-mile`,name:`Thunderhill 5-Mile`,venueName:`Thunderhill Raceway Park`,configName:`5-Mile Course (Bypass)`,location:{city:`Willows`,state:`CA`,country:`US`,lat:39.539059,lon:-122.334628},width:15,coneSpacing:10,points:[[-285.77,-109.17],[-285.34,-117.16],[-284.91,-125.15],[-284.49,-133.14],[-284.09,-141.13],[-283.72,-149.12],[-283.39,-157.12],[-283.08,-165.11],[-282.78,-173.11],[-282.51,-181.1],[-282.28,-189.1],[-282.09,-197.1],[-281.95,-205.1],[-281.94,-213.1],[-282.12,-221.1],[-282.53,-229.09],[-283.43,-237.04],[-284.67,-244.94],[-286.38,-252.76],[-288.48,-260.48],[-290.98,-268.08],[-294,-275.48],[-297.41,-282.72],[-301.38,-289.66],[-305.83,-296.31],[-310.64,-302.71],[-315.9,-308.73],[-321.46,-314.47],[-327.39,-319.85],[-333.64,-324.84],[-340.16,-329.48],[-346.89,-333.79],[-353.84,-337.77],[-360.95,-341.42],[-368.2,-344.83],[-375.55,-347.97],[-383,-350.91],[-390.51,-353.64],[-398.11,-356.15],[-405.74,-358.58],[-413.4,-360.88],[-421.08,-363.11],[-428.78,-365.29],[-436.48,-367.49],[-444.16,-369.72],[-451.83,-371.99],[-459.51,-374.26],[-467.18,-376.52],[-474.86,-378.77],[-482.54,-381.02],[-490.22,-383.25],[-497.91,-385.48],[-505.62,-387.63],[-513.33,-389.76],[-521.05,-391.85],[-528.78,-393.92],[-536.53,-395.92],[-544.29,-397.85],[-552.09,-399.63],[-559.95,-401.16],[-567.86,-402.32],[-575.83,-403.05],[-583.83,-403.24],[-591.82,-402.84],[-599.75,-401.78],[-607.55,-400.02],[-615.18,-397.63],[-622.62,-394.69],[-629.81,-391.19],[-636.68,-387.09],[-643.23,-382.5],[-649.32,-377.32],[-654.96,-371.65],[-660.07,-365.5],[-664.62,-358.92],[-668.53,-351.94],[-671.8,-344.64],[-674.31,-337.05],[-676.11,-329.26],[-677.23,-321.34],[-677.53,-313.35],[-677.27,-305.36],[-676.19,-297.43],[-674.45,-289.62],[-672.1,-281.98],[-669.15,-274.54],[-665.66,-267.34],[-661.6,-260.45],[-657.08,-253.85],[-652.01,-247.66],[-646.56,-241.81],[-640.66,-236.4],[-634.46,-231.35],[-627.97,-226.67],[-621.26,-222.31],[-614.37,-218.25],[-607.31,-214.49],[-600.03,-211.16],[-592.64,-208.1],[-585.1,-205.43],[-577.43,-203.15],[-569.7,-201.09],[-561.9,-199.3],[-554.08,-197.61],[-546.25,-195.96],[-538.42,-194.29],[-530.6,-192.6],[-522.79,-190.89],[-514.97,-189.17],[-507.18,-187.37],[-499.41,-185.43],[-491.78,-183.05],[-484.33,-180.13],[-477.15,-176.62],[-470.29,-172.5],[-463.81,-167.82],[-457.75,-162.59],[-452.23,-156.8],[-447.31,-150.5],[-442.94,-143.8],[-439.13,-136.77],[-435.94,-129.44],[-433.4,-121.85],[-431.59,-114.06],[-430.5,-106.14],[-430.22,-98.14],[-430.7,-90.16],[-432,-82.27],[-434.06,-74.55],[-436.95,-67.09],[-440.6,-59.97],[-444.94,-53.25],[-449.81,-46.91],[-455.14,-40.94],[-460.8,-35.29],[-466.7,-29.88],[-472.66,-24.55],[-478.39,-18.96],[-483.82,-13.1],[-488.63,-6.7],[-492.8,.12],[-496.26,7.33],[-499.02,14.83],[-501.05,22.57],[-502.26,30.48],[-502.64,38.46],[-502.24,46.45],[-501.18,54.37],[-499.31,62.15],[-496.89,69.77],[-493.92,77.2],[-490.46,84.41],[-486.62,91.43],[-482.69,98.4],[-478.84,105.42],[-475.23,112.56],[-472.03,119.89],[-469.16,127.36],[-466.68,134.96],[-464.47,142.65],[-462.45,150.39],[-460.58,158.17],[-458.27,165.83],[-454.59,172.9],[-448.98,178.56],[-442.13,182.65],[-434.64,185.46],[-427.23,188.45],[-420.21,192.28],[-413.79,197.04],[-407.95,202.51],[-402.88,208.7],[-398.57,215.43],[-395.15,222.65],[-392.53,230.21],[-390.83,238.02],[-390.17,245.99],[-390.5,253.98],[-391.73,261.88],[-393.73,269.63],[-396.45,277.15],[-399.8,284.41],[-403.65,291.42],[-407.92,298.19],[-412.55,304.71],[-417.63,310.9],[-423.19,316.64],[-428.99,322.15],[-435.12,327.29],[-441.43,332.22],[-447.84,337],[-454.32,341.7],[-460.84,346.33],[-467.35,350.98],[-473.79,355.73],[-480.18,360.54],[-486.43,365.54],[-492.38,370.89],[-497.86,376.71],[-502.69,383.09],[-506.81,389.94],[-510.08,397.24],[-512.63,404.81],[-514.2,412.65],[-514.87,420.62],[-514.71,428.62],[-513.88,436.57],[-512.33,444.42],[-509.98,452.06],[-507.16,459.55],[-503.74,466.77],[-499.92,473.8],[-495.72,480.61],[-491.17,487.19],[-486.31,493.55],[-481.19,499.69],[-475.81,505.61],[-470.24,511.36],[-464.49,516.92],[-458.67,522.42],[-452.87,527.93],[-447.07,533.44],[-441.25,538.93],[-435.36,544.35],[-429.42,549.7],[-423.38,554.95],[-417.27,560.12],[-411.09,565.2],[-404.8,570.16],[-398.46,575.04],[-392.01,579.77],[-385.51,584.43],[-378.84,588.85],[-372.06,593.1],[-365.1,597.03],[-357.99,600.7],[-350.75,604.11],[-343.39,607.26],[-335.9,610.05],[-328.31,612.6],[-320.64,614.86],[-312.89,616.86],[-305.09,618.63],[-297.25,620.23],[-289.37,621.66],[-281.46,622.82],[-273.52,623.78],[-265.55,624.49],[-257.56,625.06],[-249.57,625.45],[-241.58,625.74],[-233.58,625.9],[-225.58,625.99],[-217.57,626],[-209.57,625.95],[-201.57,625.85],[-193.57,625.72],[-185.57,625.54],[-177.57,625.31],[-169.58,625],[-161.59,624.59],[-153.62,623.89],[-145.65,623.1],[-137.73,621.99],[-129.84,620.69],[-122.01,619.01],[-114.25,617.08],[-106.64,614.61],[-99.17,611.75],[-91.9,608.41],[-84.79,604.76],[-77.83,600.81],[-71.06,596.54],[-64.42,592.08],[-57.94,587.39],[-51.61,582.49],[-45.47,577.36],[-39.49,572.05],[-33.69,566.53],[-28.04,560.87],[-22.55,555.05],[-17.26,549.05],[-12.16,542.88],[-7.22,536.59],[-2.33,530.25],[2.55,523.91],[7.47,517.6],[12.46,511.35],[17.49,505.12],[22.58,498.95],[27.71,492.81],[32.9,486.72],[38.13,480.66],[43.41,474.65],[48.74,468.69],[54.12,462.76],[59.51,456.85],[64.91,450.94],[70.32,445.04],[75.74,439.16],[81.19,433.3],[86.71,427.51],[92.42,421.91],[98.38,416.56],[104.73,411.71],[111.51,407.46],[118.71,403.98],[126.21,401.22],[133.99,399.36],[141.9,398.21],[149.88,397.58],[157.88,397.47],[165.88,397.56],[173.88,397.61],[181.88,397.56],[189.87,397.17],[197.77,395.97],[205.29,393.29],[211.99,388.94],[217.51,383.17],[221.72,376.39],[225.14,369.15],[228.71,362],[233.01,355.25],[237.82,348.86],[243.02,342.78],[248.55,337],[254.26,331.4],[260.02,325.85],[265.75,320.26],[271.51,314.7],[277.35,309.23],[283.25,303.83],[289.14,298.42],[294.98,292.95],[300.65,287.3],[306.1,281.44],[311.25,275.32],[316.1,268.96],[320.75,262.45],[325.27,255.84],[329.71,249.19],[334.16,242.54],[338.7,235.95],[343.28,229.39],[347.96,222.9],[352.79,216.52],[357.75,210.24],[362.98,204.18],[368.39,198.29],[374.01,192.59],[379.8,187.08],[385.76,181.74],[391.86,176.56],[398.09,171.54],[404.49,166.74],[411,162.09],[417.58,157.53],[424.21,153.05],[430.88,148.64],[437.61,144.31],[444.37,140.03],[451.16,135.79],[457.95,131.55],[464.72,127.3],[471.5,123.04],[478.25,118.74],[484.99,114.43],[491.71,110.09],[498.42,105.73],[505.1,101.33],[511.77,96.9],[518.42,92.46],[525.07,88.01],[531.72,83.55],[538.36,79.09],[544.99,74.62],[551.63,70.15],[558.25,65.65],[564.84,61.11],[571.37,56.5],[577.82,51.76],[584.16,46.87],[590.29,41.74],[596.22,36.36],[601.89,30.72],[607.19,24.73],[612.28,18.56],[616.95,12.06],[621.14,5.24],[624.88,-1.83],[628.4,-9.01],[631.79,-16.26],[635.12,-23.53],[638.59,-30.75],[642.31,-37.83],[646.33,-44.75],[650.63,-51.49],[655.14,-58.1],[659.73,-64.66],[664.22,-71.28],[668.63,-77.96],[672.93,-84.7],[677.07,-91.55],[681.02,-98.51],[684.72,-105.6],[687.91,-112.94],[690.34,-120.56],[692.07,-128.37],[692.98,-136.31],[693.03,-144.31],[692.19,-152.26],[690.5,-160.07],[687.95,-167.65],[684.47,-174.85],[680.17,-181.59],[675.08,-187.76],[669.25,-193.22],[662.86,-198.04],[656.1,-202.31],[649,-206],[641.65,-209.15],[634.18,-212.01],[626.72,-214.9],[619.32,-217.95],[612.07,-221.35],[605.02,-225.12],[598.17,-229.26],[591.52,-233.7],[585.05,-238.4],[578.73,-243.31],[572.66,-248.52],[567.1,-254.28],[562.09,-260.51],[557.61,-267.13],[553.75,-274.14],[550.61,-281.5],[548.03,-289.07],[545.99,-296.8],[544.5,-304.66],[543.43,-312.59],[542.61,-320.55],[542.02,-328.53],[541.61,-336.52],[541.2,-344.51],[540.66,-352.49],[539.83,-360.45],[538.82,-368.39],[537.7,-376.31],[536.59,-384.23],[535.62,-392.18],[534.94,-400.15],[534.51,-408.14],[534.47,-416.14],[534.72,-424.13],[535.27,-432.12],[536.14,-440.07],[537.33,-447.98],[538.91,-455.82],[540.82,-463.59],[543.12,-471.25],[545.62,-478.85],[548.41,-486.35],[551.35,-493.8],[554.41,-501.19],[557.58,-508.54],[560.72,-515.89],[563.76,-523.3],[566.6,-530.78],[569.06,-538.39],[571.03,-546.14],[572.48,-554.01],[573.45,-561.95],[573.78,-569.95],[573.6,-577.94],[572.69,-585.89],[570.95,-593.69],[568.39,-601.27],[565.04,-608.52],[560.89,-615.36],[556.11,-621.78],[550.72,-627.68],[544.87,-633.13],[538.58,-638.07],[531.92,-642.51],[525.03,-646.57],[517.94,-650.27],[510.69,-653.67],[503.36,-656.87],[495.97,-659.96],[488.58,-663],[481.19,-666.08],[473.87,-669.31],[466.6,-672.65],[459.37,-676.09],[452.16,-679.55],[444.89,-682.89],[437.56,-686.1],[430.19,-689.22],[422.79,-692.25],[415.32,-695.14],[407.8,-697.86],[400.22,-700.41],[392.52,-702.6],[384.76,-704.53],[376.91,-706.08],[368.98,-707.16],[361.01,-707.8],[353.01,-708],[345.01,-707.83],[337.05,-707.03],[329.36,-704.92],[322.6,-700.69],[317.35,-694.69],[313.63,-687.62],[311.25,-679.99],[310.01,-672.09],[310.04,-664.1],[310.67,-656.12],[311.6,-648.17],[312.66,-640.24],[313.79,-632.32],[314.88,-624.39],[315.98,-616.47],[317.06,-608.54],[318.16,-600.61],[319.27,-592.69],[320.38,-584.77],[321.44,-576.84],[322.44,-568.9],[323.38,-560.95],[324.29,-553],[325.16,-545.05],[326,-537.09],[326.83,-529.13],[327.65,-521.17],[328.49,-513.21],[329.31,-505.26],[330.15,-497.3],[330.97,-489.34],[331.77,-481.38],[332.55,-473.41],[333.39,-465.46],[334.26,-457.5],[335.18,-449.55],[336.15,-441.61],[337.11,-433.67],[338.07,-425.72],[339.01,-417.78],[339.93,-409.83],[340.86,-401.88],[341.77,-393.93],[342.72,-385.99],[343.66,-378.04],[344.59,-370.09],[345.52,-362.15],[346.43,-354.2],[347.33,-346.25],[348.22,-338.29],[349.1,-330.34],[349.98,-322.39],[350.85,-314.43],[351.7,-306.48],[352.56,-298.52],[353.42,-290.57],[354.29,-282.61],[355.17,-274.66],[356.04,-266.71],[356.89,-258.75],[357.76,-250.8],[358.62,-242.84],[359.47,-234.89],[360.32,-226.93],[361.2,-218.98],[362.09,-211.02],[362.99,-203.07],[363.89,-195.12],[364.79,-187.17],[365.7,-179.22],[366.65,-171.28],[367.64,-163.34],[368.73,-155.41],[369.92,-147.5],[371.35,-139.62],[373.22,-131.85],[375.47,-124.17],[378.13,-116.63],[381.34,-109.3],[384.97,-102.17],[389.15,-95.35],[393.52,-88.65],[398.08,-82.08],[402.77,-75.59],[407.51,-69.14],[412.28,-62.72],[417.02,-56.27],[421.69,-49.78],[426.18,-43.15],[430.25,-36.27],[433.64,-29.02],[436.24,-21.46],[438.04,-13.68],[438.77,-5.72],[438.34,2.26],[436.6,10.06],[433.72,17.52],[429.79,24.48],[424.97,30.86],[419.28,36.48],[412.82,41.19],[405.77,44.97],[398.31,47.82],[390.55,49.79],[382.67,51.12],[374.7,51.85],[366.7,51.96],[358.72,51.4],[350.81,50.24],[342.98,48.62],[335.25,46.55],[327.63,44.1],[320.01,41.67],[312.31,39.51],[304.44,38.03],[296.48,37.25],[288.49,36.85],[280.49,36.92],[272.5,37.27],[264.51,37.77],[256.54,38.41],[248.57,39.16],[240.62,40],[232.67,40.91],[224.72,41.87],[216.78,42.83],[208.83,43.78],[200.89,44.73],[192.94,45.68],[185,46.62],[177.05,47.51],[169.1,48.42],[161.15,49.34],[153.19,50.16],[145.21,50.81],[137.22,50.89],[129.29,49.85],[121.61,47.63],[114.47,44.04],[108.03,39.31],[102.46,33.58],[97.6,27.23],[93.34,20.46],[89.68,13.35],[86.76,5.91],[84.49,-1.76],[82.77,-9.58],[81.52,-17.48],[80.81,-25.45],[80.55,-33.44],[80.63,-41.44],[80.97,-49.44],[81.3,-57.43],[81.42,-65.43],[81.33,-73.43],[81.07,-81.43],[80.64,-89.42],[79.99,-97.39],[78.87,-105.31],[76.91,-113.06],[74,-120.51],[70.29,-127.59],[65.73,-134.16],[60.43,-140.15],[54.48,-145.49],[47.98,-150.16],[41.01,-154.06],[33.69,-157.3],[26.15,-159.97],[18.43,-162.06],[10.58,-163.6],[2.65,-164.67],[-5.31,-165.42],[-13.29,-166.03],[-21.27,-166.63],[-29.25,-167.23],[-37.23,-167.78],[-45.22,-168.2],[-53.22,-168.34],[-61.21,-167.9],[-69.02,-166.25],[-76.36,-163.1],[-82.96,-158.61],[-88.68,-153.03],[-93.38,-146.58],[-96.91,-139.41],[-99.59,-131.87],[-101.71,-124.16],[-103.26,-116.31],[-104.4,-108.39],[-105.34,-100.44],[-106.52,-92.53],[-108.14,-84.7],[-110.29,-76.99],[-112.76,-69.38],[-115.58,-61.9],[-118.79,-54.57],[-122.19,-47.32],[-125.71,-40.14],[-129.25,-32.96],[-132.66,-25.72],[-135.87,-18.39],[-138.86,-10.97],[-141.57,-3.44],[-144.03,4.17],[-146.24,11.86],[-148.15,19.63],[-149.79,27.46],[-151.24,35.33],[-152.44,43.24],[-153.47,51.17],[-154.24,59.14],[-154.85,67.11],[-155.29,75.1],[-155.55,83.1],[-155.72,91.1],[-155.77,99.1],[-155.74,107.1],[-155.7,115.1],[-155.67,123.11],[-155.63,131.11],[-155.6,139.11],[-155.55,147.11],[-155.49,155.11],[-155.42,163.11],[-155.34,171.11],[-155.27,179.12],[-155.2,187.12],[-155.11,195.12],[-155.02,203.12],[-154.91,211.12],[-154.78,219.12],[-154.62,227.12],[-154.38,235.12],[-154.07,243.11],[-153.67,251.1],[-153.19,259.09],[-152.61,267.07],[-151.98,275.05],[-151.32,283.02],[-150.66,291],[-150.07,298.98],[-149.52,306.96],[-149.01,314.94],[-148.47,322.93],[-148.06,330.92],[-147.67,338.91],[-147.28,346.9],[-146.91,354.9],[-146.56,362.89],[-146.21,370.88],[-145.87,378.88],[-145.56,386.87],[-145.25,394.87],[-145.01,402.87],[-144.76,410.86],[-144.47,418.86],[-144.12,426.85],[-143.75,434.85],[-143.38,442.84],[-143.05,450.84],[-142.81,458.83],[-143.06,466.83],[-144.4,474.71],[-147.02,482.26],[-150.93,489.23],[-155.85,495.52],[-161.63,501.04],[-168.14,505.67],[-175.31,509.2],[-182.97,511.46],[-190.89,512.46],[-198.87,512.14],[-206.72,510.64],[-214.36,508.26],[-221.72,505.15],[-228.77,501.38],[-235.51,497.07],[-242.02,492.41],[-248.26,487.4],[-254.2,482.05],[-259.72,476.26],[-264.83,470.1],[-269.34,463.5],[-273.28,456.54],[-276.56,449.24],[-279.37,441.75],[-281.69,434.1],[-283.62,426.33],[-285.19,418.49],[-286.43,410.58],[-287.36,402.64],[-288.02,394.66],[-288.44,386.67],[-288.64,378.67],[-288.66,370.67],[-288.49,362.67],[-288.2,354.68],[-287.85,346.68],[-287.43,338.69],[-286.99,330.7],[-286.56,322.71],[-286.15,314.72],[-285.8,306.73],[-285.48,298.73],[-285.2,290.74],[-284.95,282.74],[-284.74,274.74],[-284.57,266.74],[-284.45,258.74],[-284.35,250.74],[-284.29,242.74],[-284.25,234.74],[-284.22,226.74],[-284.22,218.73],[-284.26,210.73],[-284.31,202.73],[-284.35,194.73],[-284.4,186.73],[-284.44,178.73],[-284.48,170.73],[-284.51,162.72],[-284.56,154.72],[-284.6,146.72],[-284.65,138.72],[-284.71,130.72],[-284.79,122.72],[-284.86,114.72],[-284.93,106.72],[-285.01,98.71],[-285.09,90.71],[-285.18,82.71],[-285.27,74.71],[-285.36,66.71],[-285.45,58.71],[-285.53,50.71],[-285.61,42.71],[-285.7,34.71],[-285.79,26.7],[-285.87,18.7],[-285.95,10.7],[-286.03,2.7],[-286.11,-5.3],[-286.19,-13.3],[-286.23,-21.3],[-286.28,-29.3],[-286.27,-37.31],[-286.25,-45.31],[-286.16,-53.31],[-286.02,-61.31],[-285.83,-69.31],[-285.59,-77.3],[-285.29,-85.3],[-284.97,-93.3],[-284.6,-101.29]],elevation:[7.17,7.18,7.18,7.19,7.2,7.21,7.21,7.22,7.23,7.24,7.24,7.25,7.26,7.27,7.27,7.28,7.29,7.29,7.3,7.3,7.31,7.32,7.33,7.34,7.35,7.37,7.39,7.42,7.45,7.48,7.52,7.56,7.6,7.65,7.71,7.77,7.84,7.92,8.01,8.11,8.22,8.33,8.45,8.57,8.69,8.82,8.95,9.09,9.23,9.37,9.5,9.63,9.76,9.87,9.97,10.06,10.14,10.21,10.26,10.29,10.31,10.31,10.3,10.28,10.24,10.19,10.13,10.05,9.97,9.87,9.77,9.65,9.53,9.39,9.24,9.08,8.92,8.74,8.55,8.35,8.14,7.91,7.67,7.43,7.18,6.92,6.66,6.39,6.13,5.86,5.59,5.33,5.07,4.82,4.57,4.34,4.11,3.89,3.68,3.48,3.28,3.09,2.92,2.74,2.58,2.41,2.26,2.11,1.97,1.84,1.71,1.6,1.49,1.4,1.3,1.21,1.12,1.05,.98,.91,.85,.79,.73,.68,.64,.61,.59,.57,.54,.52,.5,.48,.47,.47,.47,.47,.49,.51,.55,.59,.64,.7,.77,.86,.95,1.05,1.16,1.28,1.4,1.53,1.66,1.81,1.96,2.12,2.28,2.44,2.61,2.79,2.97,3.15,3.34,3.53,3.72,3.91,4.11,4.31,4.51,4.72,4.92,5.11,5.3,5.49,5.67,5.84,5.99,6.13,6.26,6.37,6.45,6.52,6.56,6.57,6.55,6.5,6.41,6.3,6.16,6.01,5.86,5.7,5.55,5.39,5.23,5.07,4.9,4.73,4.57,4.42,4.27,4.15,4.04,3.94,3.86,3.79,3.73,3.68,3.64,3.62,3.6,3.58,3.57,3.56,3.54,3.53,3.51,3.48,3.45,3.42,3.38,3.34,3.29,3.22,3.15,3.07,2.99,2.91,2.83,2.76,2.69,2.62,2.55,2.5,2.46,2.46,2.48,2.54,2.62,2.75,2.89,3.07,3.26,3.49,3.74,4.02,4.33,4.68,5.07,5.5,5.98,6.5,7.07,7.68,8.33,9.02,9.73,10.44,11.16,11.86,12.53,13.14,13.68,14.06,14.29,14.29,14.09,13.66,13.08,12.36,11.58,10.76,9.94,9.13,8.34,7.58,6.86,6.19,5.57,5.02,4.52,4.09,3.72,3.42,3.19,3.01,2.88,2.79,2.73,2.69,2.65,2.61,2.57,2.52,2.47,2.41,2.35,2.29,2.22,2.15,2.08,2,1.92,1.85,1.76,1.68,1.59,1.5,1.41,1.32,1.23,1.13,1.04,.95,.86,.77,.69,.61,.53,.46,.38,.31,.23,.16,.1,.05,.02,.01,0,0,.01,.02,.04,.06,.08,.12,.17,.23,.3,.4,.5,.61,.73,.85,.98,1.11,1.25,1.38,1.51,1.64,1.76,1.88,2,2.12,2.24,2.36,2.49,2.61,2.74,2.87,3,3.12,3.25,3.36,3.47,3.58,3.68,3.77,3.86,3.94,4.02,4.09,4.16,4.23,4.31,4.38,4.45,4.52,4.59,4.66,4.74,4.81,4.87,4.93,4.99,5.05,5.1,5.16,5.22,5.27,5.32,5.35,5.38,5.39,5.41,5.42,5.44,5.47,5.49,5.52,5.56,5.59,5.64,5.68,5.73,5.79,5.86,5.93,6,6.07,6.15,6.23,6.31,6.41,6.51,6.62,6.73,6.85,6.97,7.09,7.21,7.34,7.47,7.6,7.74,7.87,8.01,8.15,8.3,8.46,8.63,8.83,9.04,9.25,9.47,9.7,9.92,10.15,10.39,10.63,10.88,11.13,11.39,11.65,11.92,12.18,12.45,12.71,12.98,13.25,13.51,13.79,14.07,14.35,14.64,14.94,15.25,15.56,15.87,16.19,16.52,16.84,17.18,17.51,17.85,18.2,18.55,18.91,19.27,19.64,20.01,20.38,20.75,21.13,21.5,21.88,22.26,22.64,23.02,23.4,23.77,24.15,24.52,24.89,25.25,25.61,25.97,26.33,26.7,27.07,27.46,27.85,28.26,28.69,29.13,29.59,30.09,30.61,31.15,31.73,32.34,32.99,33.69,34.43,35.2,35.98,36.74,37.43,38.05,38.56,38.96,39.24,39.42,39.5,39.49,39.43,39.35,39.3,39.33,39.44,39.61,39.81,39.98,40.09,40.12,40.03,39.83,39.52,39.11,38.6,38.01,37.35,36.64,35.91,35.15,34.38,33.61,32.84,32.08,31.36,30.68,30.08,29.54,29.09,28.7,28.37,28.09,27.84,27.62,27.41,27.22,27.03,26.85,26.67,26.5,26.34,26.17,26,25.83,25.64,25.43,25.21,24.97,24.71,24.41,24.09,23.74,23.37,23,22.63,22.26,21.9,21.54,21.16,20.78,20.38,19.97,19.55,19.14,18.74,18.36,18,17.65,17.34,17.04,16.77,16.52,16.3,16.1,15.93,15.78,15.65,15.53,15.42,15.31,15.2,15.1,15,14.9,14.8,14.7,14.6,14.5,14.4,14.31,14.22,14.13,14.04,13.94,13.85,13.76,13.67,13.59,13.51,13.43,13.36,13.28,13.21,13.12,13.03,12.94,12.86,12.78,12.73,12.7,12.7,12.7,12.7,12.7,12.67,12.64,12.59,12.54,12.47,12.39,12.3,12.19,12.06,11.92,11.77,11.61,11.43,11.25,11.07,10.88,10.69,10.51,10.33,10.16,9.99,9.84,9.7,9.58,9.47,9.4,9.35,9.33,9.34,9.38,9.44,9.52,9.62,9.73,9.84,9.97,10.11,10.25,10.41,10.57,10.74,10.91,11.07,11.21,11.34,11.45,11.54,11.61,11.67,11.73,11.78,11.83,11.88,11.93,11.98,12.04,12.09,12.13,12.17,12.2,12.21,12.22,12.21,12.18,12.14,12.07,11.98,11.87,11.74,11.62,11.49,11.37,11.25,11.15,11.06,10.97,10.9,10.83,10.75,10.66,10.56,10.45,10.32,10.18,10.04,9.89,9.73,9.56,9.38,9.19,9,8.8,8.6,8.41,8.22,8.03,7.85,7.68,7.51,7.36,7.21,7.08,6.96,6.85,6.76,6.68,6.6,6.54,6.49,6.44,6.39,6.34,6.29,6.24,6.18,6.11,6.05,5.98,5.92,5.85,5.77,5.7,5.62,5.53,5.45,5.36,5.27,5.17,5.09,5,4.92,4.84,4.76,4.68,4.59,4.52,4.45,4.4,4.37,4.36,4.36,4.4,4.45,4.51,4.59,4.68,4.77,4.87,4.95,5.03,5.1,5.15,5.16,5.15,5.1,5.02,4.9,4.74,4.56,4.35,4.12,3.87,3.61,3.35,3.08,2.82,2.57,2.34,2.13,1.95,1.79,1.66,1.54,1.44,1.36,1.3,1.27,1.26,1.28,1.33,1.39,1.47,1.57,1.7,1.86,2.03,2.22,2.41,2.58,2.73,2.87,2.98,3.07,3.14,3.22,3.3,3.39,3.5,3.63,3.79,3.97,4.17,4.38,4.6,4.83,5.05,5.27,5.49,5.71,5.93,6.15,6.37,6.59,6.81,7.02,7.24,7.46,7.68,7.89,8.11,8.33,8.55,8.77,8.99,9.21,9.43,9.65,9.87,10.09,10.3,10.49,10.64,10.76,10.83,10.86,10.86,10.84,10.82,10.8,10.8,10.81,10.84,10.89,10.94,11.01,11.08,11.15,11.22,11.29,11.35,11.42,11.49,11.55,11.62,11.69,11.76,11.84,11.91,11.98,12.05,12.12,12.18,12.25,12.32,12.38,12.45,12.51,12.58,12.65,12.72,12.79,12.86,12.93,13,13.07,13.15,13.22,13.3,13.37,13.44,13.51,13.57,13.64,13.71,13.78,13.85,13.92,14,14.07,14.15,14.22,14.3,14.37,14.43,14.5,14.57,14.64,14.71,14.78,14.85,14.92,14.99,15.06,15.12,15.18,15.24,15.29,15.35,15.4,15.44,15.48,15.51,15.54,15.58,15.64,15.71,15.8,15.92,16.04,16.17,16.29,16.4,16.49,16.57,16.63,16.68,16.73,16.78,16.83,16.89,16.95,17.03,17.11,17.19,17.26,17.31,17.35,17.37,17.39,17.39,17.39,17.4,17.42,17.45,17.49,17.55,17.6,17.66,17.71,17.77,17.85,17.94,18.06,18.22,18.41,18.65,18.93,19.26,19.62,20.01,20.43,20.87,21.31,21.75,22.18,22.58,22.95,23.3,23.63,23.97,24.34,24.73,25.13,25.54,25.93,26.31,26.68,27.05,27.4,27.74,28.05,28.33,28.59,28.79,28.95,29.05,29.1,29.09,29.03,28.91,28.75,28.53,28.26,27.92,27.53,27.06,26.55,25.97,25.36,24.71,24.04,23.35,22.68,22.02,21.4,20.83,20.31,19.84,19.42,19.05,18.72,18.44,18.21,18.02,17.87,17.76,17.66,17.58,17.52,17.47,17.44,17.42,17.42,17.42,17.44,17.48,17.52,17.57,17.62,17.66,17.69,17.7,17.7,17.68,17.65,17.61,17.55,17.47,17.38,17.27,17.13,16.96,16.76,16.52,16.26,15.96,15.65,15.33,15,14.67,14.35,14.05,13.78,13.55,13.36,13.19,13.04,12.91,12.78,12.65,12.52,12.39,12.26,12.15,12.04,11.95,11.88,11.83,11.8,11.8,11.82,11.86,11.91,11.97,12.03,12.11,12.2,12.33,12.48,12.67,12.88,13.09,13.28,13.45,13.58,13.66,13.69,13.68,13.64,13.55,13.44,13.29,13.11,12.89,12.67,12.42,12.17,11.9,11.64,11.39,11.16,10.97,10.81,10.68,10.57,10.48,10.4,10.33,10.28,10.23,10.2,10.17,10.14,10.11,10.08,10.05,10.01,9.97,9.92,9.88,9.83,9.78,9.73,9.68,9.64,9.6,9.56,9.52,9.48,9.45,9.43,9.42,9.41,9.41,9.42,9.43,9.45,9.47,9.49,9.52,9.55,9.59,9.64,9.68,9.74,9.8,9.86,9.93,10.01,10.09,10.18,10.27,10.38,10.48,10.59,10.69,10.79,10.88,10.98,11.07,11.17,11.26,11.35,11.44,11.52,11.6,11.68,11.75,11.83,11.9,11.96,12.02,12.06,12.09,12.12,12.13,12.14,12.13,12.11,12.08,12.05,12,11.95,11.9,11.84,11.77,11.69,11.6,11.5,11.4,11.3,11.2,11.09,10.99,10.88,10.78,10.68,10.58,10.47,10.37,10.27,10.17,10.07,9.97,9.87,9.77,9.67,9.56,9.44,9.3,9.16,9.01,8.85,8.7,8.54,8.4,8.27,8.15,8.06,7.99,7.94,7.91,7.9,7.91,7.92,7.93,7.93,7.91,7.88,7.83,7.77,7.7,7.62,7.52,7.42,7.32,7.23,7.12,7.01,6.89,6.76,6.63,6.52,6.43,6.37,6.33,6.3,6.29,6.27,6.26,6.26,6.26,6.26,6.27,6.29,6.31,6.32,6.34,6.36,6.37,6.39,6.4,6.42,6.44,6.46,6.48,6.51,6.53,6.56,6.59,6.62,6.65,6.68,6.71,6.74,6.76,6.78,6.8,6.81,6.81,6.82,6.82,6.83,6.83,6.84,6.85,6.86,6.88,6.89,6.9,6.91,6.91,6.92,6.92,6.92,6.92,6.93,6.93,6.94,6.95,6.95,6.96,6.97,6.97,6.96,6.96,6.95,6.95,6.95,6.96,6.96,6.97,6.97,6.98,6.98,6.98,6.99,7,7,7.01,7.01,7.01,7.01,7.01,7.02,7.02,7.02,7.03,7.03,7.04,7.04,7.05,7.05,7.05,7.05,7.05,7.05,7.05,7.05,7.06,7.06,7.07,7.07,7.08,7.09,7.09,7.1,7.11,7.11,7.12,7.13,7.13,7.14,7.15,7.15,7.16],elevationSource:`USGS 3DEP`},{id:`thunderhill-east`,name:`Thunderhill East`,venueName:`Thunderhill Raceway Park`,configName:`East Course`,location:{city:`Willows`,state:`CA`,country:`US`,lat:39.540412,lon:-122.33144},width:15,coneSpacing:10,points:[[-12.09,-229.01],[-11.86,-237.01],[-11.61,-245.01],[-11.34,-253.01],[-11.05,-261.01],[-10.76,-269.01],[-10.45,-277.01],[-10.15,-285.01],[-9.88,-293.01],[-9.65,-301.02],[-9.48,-309.02],[-9.34,-317.02],[-9.18,-325.03],[-9.06,-333.03],[-9.03,-341.04],[-9.21,-349.04],[-9.69,-357.03],[-10.6,-364.98],[-11.97,-372.87],[-13.81,-380.66],[-16.2,-388.3],[-19.12,-395.75],[-22.53,-402.99],[-26.35,-410.03],[-30.65,-416.78],[-35.34,-423.27],[-40.4,-429.46],[-45.78,-435.39],[-51.53,-440.96],[-57.59,-446.19],[-63.96,-451.04],[-70.59,-455.52],[-77.45,-459.64],[-84.48,-463.48],[-91.66,-467.02],[-98.96,-470.3],[-106.36,-473.35],[-113.83,-476.25],[-121.36,-478.96],[-128.95,-481.51],[-136.58,-483.94],[-144.23,-486.28],[-151.91,-488.55],[-159.59,-490.81],[-167.27,-493.07],[-174.94,-495.35],[-182.62,-497.62],[-190.29,-499.92],[-197.95,-502.23],[-205.62,-504.52],[-213.29,-506.81],[-220.96,-509.11],[-228.64,-511.37],[-236.33,-513.61],[-244.02,-515.82],[-251.74,-517.96],[-259.47,-520.02],[-267.24,-521.97],[-275.04,-523.78],[-282.86,-525.49],[-290.71,-527.03],[-298.64,-528.13],[-306.63,-528.67],[-314.63,-528.6],[-322.6,-527.87],[-330.49,-526.51],[-338.25,-524.57],[-345.83,-521.99],[-353.14,-518.74],[-360.15,-514.88],[-366.81,-510.44],[-373.05,-505.43],[-378.85,-499.91],[-384.12,-493.9],[-388.86,-487.45],[-393.08,-480.65],[-396.79,-473.55],[-399.85,-466.16],[-402.27,-458.53],[-404.01,-450.72],[-405.05,-442.79],[-405.39,-434.79],[-404.95,-426.8],[-403.7,-418.9],[-401.72,-411.15],[-399.02,-403.61],[-395.65,-396.35],[-391.73,-389.37],[-387.36,-382.67],[-382.55,-376.27],[-377.34,-370.2],[-371.76,-364.45],[-365.81,-359.1],[-359.56,-354.1],[-352.99,-349.53],[-346.16,-345.35],[-339.11,-341.56],[-331.88,-338.14],[-324.5,-335.04],[-317,-332.25],[-309.39,-329.74],[-301.7,-327.51],[-293.95,-325.54],[-286.13,-323.78],[-278.3,-322.14],[-270.47,-320.49],[-262.64,-318.79],[-254.83,-317.05],[-247.02,-315.27],[-239.23,-313.44],[-231.45,-311.55],[-223.7,-309.54],[-216.01,-307.31],[-208.46,-304.66],[-201.22,-301.26],[-194.47,-296.96],[-188.31,-291.86],[-182.68,-286.17],[-177.6,-279.99],[-173.13,-273.35],[-169.23,-266.36],[-165.92,-259.08],[-163.22,-251.54],[-161.12,-243.82],[-159.7,-235.94],[-159.03,-227.97],[-159.07,-219.97],[-159.73,-211.99],[-161.09,-204.1],[-163.17,-196.38],[-165.98,-188.88],[-169.44,-181.67],[-173.55,-174.8],[-178.26,-168.34],[-183.52,-162.3],[-189.19,-156.65],[-195.15,-151.3],[-201.08,-145.93],[-206.79,-140.32],[-212.16,-134.38],[-216.99,-128.01],[-221.21,-121.21],[-224.71,-114.01],[-227.34,-106.45],[-229.07,-98.64],[-229.86,-90.68],[-229.75,-82.68],[-228.84,-74.73],[-227.22,-66.89],[-224.98,-59.21],[-222.16,-51.72],[-218.86,-44.43],[-215.15,-37.33],[-211.28,-30.33],[-207.46,-23.29],[-203.85,-16.15],[-200.56,-8.85],[-197.54,-1.44],[-194.83,6.1],[-192.43,13.73],[-190.35,21.46],[-188.51,29.25],[-186.78,37.07],[-184.29,44.66],[-179.78,51.23],[-173.4,56.02],[-166.16,59.43],[-158.74,62.43],[-151.54,65.93],[-144.78,70.2],[-138.52,75.19],[-132.91,80.89],[-128.03,87.23],[-124.06,94.17],[-121.05,101.58],[-119.05,109.33],[-118.06,117.27],[-117.97,125.27],[-118.77,133.23],[-120.31,141.08],[-122.51,148.78],[-125.32,156.27],[-128.72,163.52],[-132.68,170.48],[-137.11,177.14],[-141.96,183.51],[-147.24,189.52],[-152.88,195.2],[-158.85,200.53],[-165.1,205.54],[-171.56,210.27],[-178.09,214.88],[-184.64,219.49],[-191.17,224.13],[-197.68,228.79],[-204.15,233.5],[-210.48,238.4],[-216.46,243.72],[-221.99,249.5],[-226.93,255.8],[-231.21,262.56],[-234.82,269.7],[-237.59,277.2],[-239.5,284.97],[-240.54,292.9],[-240.89,300.9],[-240.54,308.89],[-239.49,316.83],[-237.8,324.65],[-235.37,332.27],[-232.27,339.65],[-228.61,346.77],[-224.47,353.62],[-219.99,360.25],[-215.21,366.68],[-210.15,372.87],[-204.81,378.84],[-199.22,384.58],[-193.52,390.19],[-187.68,395.66],[-181.8,401.11],[-175.94,406.56],[-170.08,412.01],[-164.25,417.49],[-158.41,422.97],[-152.56,428.44],[-146.69,433.88],[-140.77,439.27],[-134.78,444.58],[-128.66,449.74],[-122.42,454.75],[-115.98,459.51],[-109.36,464.02],[-102.58,468.26],[-95.62,472.22],[-88.5,475.89],[-81.23,479.23],[-73.82,482.25],[-66.3,484.99],[-58.67,487.44],[-50.99,489.67],[-43.24,491.68],[-35.43,493.47],[-27.59,495.09],[-19.72,496.55],[-11.81,497.78],[-3.87,498.8],[4.09,499.6],[12.07,500.28],[20.06,500.8],[28.06,501.12],[36.06,501.33],[44.06,501.42],[52.07,501.45],[60.08,501.45],[68.08,501.41],[76.09,501.36],[84.09,501.27],[92.1,501.15],[100.1,500.95],[108.1,500.66],[116.09,500.22],[124.07,499.58],[132.03,498.68],[139.94,497.47],[147.8,495.94],[155.59,494.11],[163.29,491.91],[170.82,489.2],[178.18,486.07],[185.39,482.59],[192.43,478.77],[199.27,474.62],[205.91,470.15],[212.35,465.39],[218.58,460.37],[224.65,455.15],[230.6,449.79],[236.43,444.3],[242.13,438.68],[247.71,432.94],[253.19,427.11],[258.62,421.22],[264.05,415.34],[269.49,409.47],[274.94,403.61],[280.41,397.76],[285.88,391.91],[291.38,386.09],[296.89,380.29],[302.42,374.5],[307.96,368.73],[313.51,362.95],[319.05,357.18],[324.61,351.41],[330.16,345.64],[335.72,339.89],[341.29,334.13],[346.87,328.39],[352.44,322.64],[358,316.88],[363.57,311.13],[369.14,305.38],[374.69,299.61],[380.22,293.82],[385.75,288.03],[391.27,282.24],[396.74,276.39],[402.15,270.49],[407.35,264.41],[412.09,257.96],[415.83,250.89],[418.65,243.41],[420.38,235.6],[421.15,227.64],[421,219.64],[419.96,211.71],[418.15,203.91],[415.75,196.27],[412.89,188.8],[409.81,181.4],[406.69,174.03],[403.55,166.67],[400.47,159.28],[397.55,151.83],[394.79,144.31],[392.11,136.77],[389.5,129.2],[386.96,121.61],[384.53,113.98],[382.33,106.28],[380.44,98.5],[378.78,90.67],[377.37,82.79],[376.09,74.89],[374.96,66.96],[373.99,59.02],[373.19,51.05],[372.51,43.08],[371.96,35.09],[371.54,27.1],[371.17,19.1],[370.86,11.1],[370.57,3.1],[370.34,-4.9],[370.11,-12.91],[369.89,-20.91],[369.65,-28.91],[369.41,-36.91],[369.14,-44.91],[368.82,-52.91],[368.47,-60.91],[368.07,-68.91],[367.62,-76.9],[367.12,-84.89],[366.56,-92.88],[365.94,-100.86],[365.28,-108.84],[364.57,-116.81],[363.83,-124.78],[363.08,-132.75],[362.3,-140.72],[361.52,-148.69],[360.7,-156.65],[359.85,-164.61],[359.01,-172.57],[358.17,-180.53],[357.34,-188.5],[356.54,-196.46],[355.75,-204.43],[354.86,-212.38],[353.78,-220.32],[352.22,-228.17],[350.06,-235.88],[347.28,-243.38],[343.86,-250.61],[339.73,-257.47],[334.78,-263.75],[329.22,-269.5],[323.01,-274.54],[316.27,-278.84],[309.1,-282.4],[301.56,-285.08],[293.77,-286.91],[285.85,-288.04],[277.87,-288.76],[269.88,-289.21],[261.88,-289.57],[253.89,-289.99],[245.9,-290.45],[237.9,-290.94],[229.92,-291.46],[221.92,-291.93],[213.92,-292.2],[205.95,-291.58],[198.34,-289.17],[191.59,-284.9],[185.94,-279.25],[181.67,-272.49],[178.31,-265.23],[175.74,-257.65],[173.78,-249.89],[172.3,-242.02],[171.06,-234.11],[169.74,-226.22],[168.05,-218.4],[165.99,-210.66],[163.53,-203.04],[160.71,-195.55],[157.57,-188.19],[154.17,-180.94],[150.67,-173.74],[147.16,-166.55],[143.7,-159.32],[140.42,-152.02],[137.38,-144.62],[134.6,-137.11],[132.09,-129.51],[129.87,-121.82],[127.85,-114.07],[126.07,-106.27],[124.54,-98.41],[123.17,-90.52],[122.02,-82.6],[121.03,-74.66],[120.25,-66.69],[119.64,-58.71],[119.2,-50.71],[118.92,-42.71],[118.7,-34.71],[118.5,-26.71],[118.3,-18.7],[118.17,-10.7],[118.09,-2.69],[118.07,5.31],[118.16,13.32],[118.32,21.32],[118.58,29.32],[118.91,37.32],[119.33,45.32],[119.83,53.31],[120.38,61.29],[120.99,69.27],[121.61,77.26],[122.23,85.24],[122.84,93.22],[123.41,101.21],[123.96,109.19],[124.5,117.18],[125,125.17],[125.43,133.16],[125.81,141.16],[126.14,149.16],[126.4,157.16],[126.64,165.16],[126.85,173.17],[127,181.17],[127.1,189.17],[127.21,197.18],[127.34,205.18],[127.45,213.19],[127.58,221.19],[127.74,229.2],[127.9,237.2],[128.08,245.21],[128.28,253.21],[128.49,261.21],[128.7,269.21],[128.91,277.22],[129.1,285.22],[129.27,293.22],[129.38,301.23],[129.41,309.24],[129.4,317.24],[129.28,325.25],[129.15,333.25],[128.83,341.25],[127.79,349.18],[125.79,356.93],[122.89,364.38],[118.9,371.31],[113.88,377.53],[107.85,382.78],[100.99,386.88],[93.46,389.57],[85.59,391],[77.6,391.09],[69.71,389.78],[62.09,387.36],[54.83,383.98],[47.87,380.02],[41.19,375.62],[34.71,370.91],[28.46,365.92],[22.49,360.59],[16.87,354.89],[11.62,348.85],[6.77,342.48],[2.38,335.79],[-1.49,328.78],[-4.99,321.58],[-8.04,314.18],[-10.63,306.61],[-12.7,298.87],[-14.25,291.02],[-15.43,283.11],[-16.2,275.14],[-16.75,267.15],[-17.05,259.15],[-17.11,251.15],[-16.95,243.14],[-16.62,235.14],[-16.24,227.15],[-15.83,219.15],[-15.41,211.16],[-14.99,203.16],[-14.59,195.17],[-14.23,187.17],[-13.92,179.17],[-13.65,171.17],[-13.4,163.17],[-13.15,155.17],[-12.91,147.16],[-12.66,139.16],[-12.43,131.16],[-12.23,123.16],[-12.09,115.15],[-11.99,107.15],[-11.92,99.14],[-11.86,91.14],[-11.83,83.13],[-11.8,75.13],[-11.79,67.12],[-11.8,59.11],[-11.83,51.11],[-11.9,43.1],[-11.97,35.1],[-12.04,27.09],[-12.1,19.09],[-12.15,11.08],[-12.2,3.08],[-12.25,-4.93],[-12.29,-12.94],[-12.34,-20.94],[-12.37,-28.95],[-12.4,-36.95],[-12.45,-44.96],[-12.48,-52.96],[-12.52,-60.97],[-12.56,-68.97],[-12.59,-76.98],[-12.62,-84.99],[-12.61,-92.99],[-12.61,-101],[-12.6,-109],[-12.58,-117.01],[-12.56,-125.01],[-12.53,-133.02],[-12.5,-141.03],[-12.46,-149.03],[-12.45,-157.04],[-12.45,-165.04],[-12.45,-173.05],[-12.41,-181.05],[-12.34,-189.06],[-12.28,-197.06],[-12.17,-205.07],[-12.03,-213.07],[-11.87,-221.08]],elevation:[7.18,7.18,7.19,7.2,7.21,7.21,7.22,7.23,7.24,7.24,7.25,7.26,7.27,7.28,7.28,7.29,7.3,7.31,7.31,7.32,7.33,7.33,7.34,7.34,7.35,7.36,7.38,7.41,7.44,7.47,7.51,7.55,7.59,7.63,7.68,7.73,7.79,7.86,7.95,8.04,8.14,8.26,8.39,8.5,8.62,8.74,8.87,9.01,9.16,9.31,9.45,9.58,9.71,9.83,9.94,10.04,10.13,10.2,10.26,10.31,10.34,10.36,10.35,10.34,10.31,10.27,10.21,10.15,10.07,9.98,9.88,9.77,9.65,9.53,9.38,9.23,9.06,8.88,8.71,8.52,8.32,8.1,7.87,7.63,7.37,7.12,6.86,6.6,6.34,6.08,5.81,5.55,5.29,5.03,4.79,4.55,4.33,4.11,3.91,3.71,3.52,3.33,3.15,2.97,2.81,2.65,2.49,2.34,2.2,2.06,1.93,1.8,1.68,1.58,1.48,1.38,1.28,1.19,1.11,1.04,.97,.91,.84,.78,.73,.69,.66,.65,.63,.6,.58,.56,.55,.54,.53,.52,.52,.52,.53,.55,.58,.62,.67,.73,.81,.89,1,1.1,1.22,1.34,1.47,1.6,1.74,1.89,2.04,2.2,2.36,2.52,2.7,2.87,3.05,3.24,3.43,3.62,3.81,4.01,4.21,4.41,4.61,4.81,5.01,5.2,5.39,5.58,5.75,5.92,6.06,6.2,6.31,6.41,6.47,6.52,6.53,6.52,6.48,6.42,6.33,6.21,6.06,5.92,5.77,5.63,5.49,5.34,5.18,5.02,4.86,4.69,4.53,4.38,4.24,4.13,4.04,3.95,3.88,3.82,3.76,3.71,3.68,3.65,3.63,3.61,3.59,3.58,3.55,3.53,3.5,3.47,3.44,3.41,3.37,3.32,3.26,3.19,3.11,3.04,2.96,2.89,2.82,2.75,2.68,2.61,2.54,2.49,2.46,2.47,2.51,2.59,2.7,2.84,3,3.19,3.4,3.64,3.91,4.21,4.56,4.94,5.37,5.83,6.34,6.9,7.51,8.15,8.84,9.55,10.28,11,11.72,12.41,13.06,13.63,14.08,14.38,14.43,14.26,13.84,13.27,12.55,11.77,10.94,10.11,9.3,8.51,7.74,7.01,6.32,5.68,5.11,4.6,4.16,3.78,3.47,3.22,3.04,2.91,2.82,2.76,2.72,2.68,2.64,2.59,2.54,2.48,2.41,2.35,2.29,2.22,2.15,2.07,2,1.92,1.85,1.77,1.68,1.6,1.51,1.42,1.33,1.24,1.15,1.06,.97,.88,.8,.72,.64,.56,.49,.41,.33,.25,.17,.1,.05,.01,0,0,.01,.02,.03,.04,.06,.08,.12,.17,.23,.31,.4,.51,.62,.73,.86,.98,1.12,1.25,1.38,1.51,1.64,1.76,1.88,2,2.12,2.24,2.36,2.49,2.61,2.74,2.86,2.99,3.12,3.25,3.37,3.49,3.6,3.71,3.81,3.9,3.98,4.06,4.13,4.21,4.28,4.35,4.42,4.48,4.55,4.62,4.68,4.75,4.81,4.88,4.94,4.99,5.04,5.09,5.15,5.21,5.28,5.33,5.37,5.4,5.41,5.42,5.44,5.46,5.48,5.51,5.54,5.58,5.62,5.66,5.71,5.76,5.82,5.89,5.95,6.02,6.09,6.17,6.24,6.33,6.43,6.53,6.64,6.75,6.87,6.99,7.11,7.24,7.37,7.49,7.63,7.76,7.89,8.03,8.16,8.3,8.46,8.64,8.85,9.06,9.29,9.52,9.74,9.97,10.2,10.44,10.68,10.92,11.18,11.44,11.7,11.97,12.24,12.51,12.78,13.05,13.31,13.59,13.87,14.15,14.45,14.75,15.05,15.37,15.69,16.01,16.35,16.68,17.03,17.37,17.73,18.08,18.44,18.8,19.18,19.56,19.94,20.31,20.69,21.08,21.46,21.84,22.23,22.61,23,23.38,23.77,24.15,24.53,24.91,25.28,25.64,26,26.35,26.7,27.05,27.4,27.75,28.1,28.44,28.77,29.08,29.38,29.66,29.92,30.16,30.39,30.62,30.87,31.14,31.43,31.73,32.05,32.39,32.74,33.08,33.4,33.68,33.93,34.13,34.28,34.35,34.37,34.33,34.23,34.09,33.89,33.64,33.35,32.99,32.58,32.12,31.6,31.02,30.38,29.68,28.94,28.19,27.43,26.69,25.97,25.29,24.65,24.04,23.48,22.95,22.47,22.03,21.63,21.27,20.95,20.67,20.43,20.22,20.05,19.9,19.77,19.66,19.55,19.46,19.35,19.25,19.14,19.03,18.91,18.8,18.69,18.58,18.48,18.37,18.27,18.17,18.08,18,17.93,17.87,17.81,17.77,17.73,17.69,17.66,17.64,17.62,17.62,17.62,17.63,17.64,17.66,17.69,17.73,17.77,17.8,17.82,17.83,17.83,17.81,17.79,17.74,17.69,17.62,17.54,17.43,17.31,17.15,16.97,16.76,16.53,16.27,15.98,15.67,15.36,15.05,14.74,14.45,14.17,13.94,13.74,13.57,13.41,13.27,13.12,12.97,12.81,12.65,12.5,12.35,12.21,12.09,11.99,11.9,11.84,11.81,11.8,11.82,11.86,11.91,11.97,12.04,12.13,12.22,12.32,12.46,12.62,12.8,13.01,13.21,13.4,13.55,13.66,13.72,13.74,13.72,13.66,13.56,13.43,13.26,13.05,12.82,12.57,12.32,12.06,11.79,11.5,11.23,10.99,10.81,10.66,10.55,10.46,10.38,10.31,10.25,10.21,10.18,10.16,10.14,10.12,10.1,10.07,10.04,10,9.96,9.92,9.88,9.83,9.78,9.73,9.69,9.65,9.62,9.58,9.54,9.52,9.49,9.47,9.46,9.45,9.45,9.46,9.47,9.48,9.5,9.52,9.55,9.59,9.64,9.69,9.74,9.81,9.88,9.96,10.04,10.12,10.21,10.31,10.43,10.55,10.68,10.8,10.91,11.01,11.11,11.2,11.3,11.41,11.51,11.6,11.68,11.75,11.82,11.88,11.94,12.01,12.07,12.12,12.16,12.19,12.2,12.22,12.22,12.22,12.2,12.16,12.12,12.07,12.02,11.97,11.91,11.84,11.76,11.67,11.57,11.47,11.37,11.26,11.16,11.05,10.95,10.85,10.75,10.64,10.54,10.43,10.32,10.22,10.11,10.01,9.91,9.81,9.71,9.6,9.47,9.34,9.2,9.04,8.89,8.75,8.6,8.46,8.32,8.2,8.1,8.03,7.98,7.95,7.94,7.94,7.95,7.97,7.98,7.97,7.93,7.89,7.84,7.78,7.7,7.61,7.52,7.41,7.31,7.22,7.12,7.01,6.87,6.73,6.59,6.48,6.41,6.36,6.32,6.29,6.26,6.24,6.23,6.22,6.23,6.23,6.24,6.26,6.28,6.3,6.31,6.32,6.33,6.34,6.36,6.39,6.41,6.42,6.45,6.47,6.51,6.53,6.56,6.59,6.63,6.66,6.69,6.72,6.75,6.77,6.78,6.79,6.79,6.8,6.8,6.81,6.82,6.83,6.84,6.85,6.86,6.88,6.89,6.9,6.9,6.91,6.91,6.91,6.92,6.92,6.93,6.93,6.94,6.95,6.96,6.97,6.96,6.96,6.95,6.94,6.94,6.94,6.95,6.96,6.97,6.97,6.97,6.97,6.98,6.99,7,7.01,7.01,7.02,7.02,7.02,7.02,7.02,7.02,7.02,7.03,7.04,7.05,7.05,7.06,7.06,7.06,7.06,7.06,7.07,7.07,7.07,7.08,7.08,7.09,7.09,7.1,7.1,7.11,7.12,7.12,7.13,7.14,7.14,7.15,7.16,7.16,7.17],elevationSource:`USGS 3DEP`},{id:`road-9fdb0b20-df7c-4b55-9ead-4e414fe93bd1`,closed:!1,name:`Wolf Pen Gap Road, GA`,width:8,shoulderWidth:2,terrainTransition:2,doubleYellow:!0,coneSpacing:10,points:[[-1957.16,664.6],[-1951.01,669.74],[-1944.86,674.88],[-1938.71,680.02],[-1932.17,684.6],[-1925.24,688.63],[-1918.31,692.65],[-1911.39,696.68],[-1904.46,700.71],[-1897.53,704.74],[-1890.22,707.79],[-1882.39,709.51],[-1874.57,711.23],[-1866.74,712.95],[-1858.91,714.67],[-1851.03,715.89],[-1843.01,715.89],[-1835,715.89],[-1827.02,715.66],[-1819.28,713.55],[-1811.55,711.45],[-1803.82,709.34],[-1796.09,707.23],[-1789.54,702.68],[-1783.08,697.93],[-1776.62,693.18],[-1770.17,688.44],[-1763.71,683.69],[-1758.63,677.59],[-1753.97,671.06],[-1749.31,664.54],[-1744.65,658.02],[-1739.99,651.5],[-1736.23,644.5],[-1733.34,637.02],[-1730.45,629.55],[-1727.56,622.07],[-1724.68,614.59],[-1721.79,607.12],[-1718.9,599.64],[-1716.01,592.17],[-1713.12,584.69],[-1710.23,577.22],[-1707.35,569.74],[-1704.46,562.27],[-1700.45,555.33],[-1696.42,548.4],[-1692.38,541.48],[-1688.34,534.56],[-1684.3,527.64],[-1680.26,520.71],[-1676.22,513.79],[-1672.19,506.87],[-1668.15,499.95],[-1664.11,493.02],[-1660.07,486.1],[-1655.91,479.27],[-1650.28,473.57],[-1644.65,467.86],[-1639.02,462.16],[-1633.4,456.45],[-1627.77,450.75],[-1622.14,445.04],[-1616.51,439.33],[-1610.89,433.63],[-1605.26,427.92],[-1599.63,422.22],[-1594,416.51],[-1588.37,410.81],[-1582.33,405.57],[-1575.94,400.74],[-1569.55,395.9],[-1563.15,391.07],[-1556.76,386.24],[-1550.37,381.4],[-1543.98,376.57],[-1537.58,371.74],[-1531.19,366.9],[-1524.8,362.07],[-1518.41,357.24],[-1512.01,352.4],[-1505.62,347.57],[-1498.19,344.59],[-1490.73,341.67],[-1483.27,338.74],[-1475.8,335.82],[-1468.34,332.9],[-1460.88,329.98],[-1453.42,327.05],[-1445.95,324.13],[-1438.49,321.21],[-1431.03,318.29],[-1423.57,315.36],[-1416.11,312.44],[-1408.64,309.52],[-1401.18,306.6],[-1393.72,303.67],[-1386.19,300.97],[-1378.39,299.11],[-1370.6,297.24],[-1362.8,295.37],[-1355.01,293.51],[-1347.22,291.64],[-1339.42,289.77],[-1331.63,287.91],[-1323.84,286.04],[-1315.98,284.62],[-1307.97,284.33],[-1299.96,284.04],[-1291.95,283.75],[-1283.94,283.46],[-1275.94,283.16],[-1267.93,282.87],[-1259.92,282.58],[-1251.91,282.29],[-1243.9,282],[-1235.89,281.71],[-1227.88,281.42],[-1219.87,281.13],[-1211.86,280.83],[-1204.33,283.26],[-1196.91,286.27],[-1189.48,289.28],[-1182.06,292.3],[-1174.63,295.31],[-1167.2,298.32],[-1159.78,301.34],[-1152.35,304.35],[-1144.93,307.37],[-1138.76,304.17],[-1133.09,298.5],[-1127.42,292.83],[-1122.99,286.27],[-1119.37,279.12],[-1115.75,271.97],[-1112.13,264.83],[-1108.5,257.68],[-1104.88,250.53],[-1101.26,243.38],[-1097.64,236.23],[-1094.02,229.08],[-1090.4,221.93],[-1086.97,214.74],[-1087.35,206.73],[-1087.73,198.73],[-1088.11,190.72],[-1088.49,182.72],[-1088.88,174.71],[-1089.26,166.71],[-1089.64,158.7],[-1089.14,150.8],[-1086.91,143.1],[-1084.67,135.41],[-1082.44,127.71],[-1079.05,120.64],[-1073.83,114.56],[-1068.62,108.47],[-1063.4,102.39],[-1058.18,96.3],[-1051.81,91.49],[-1045.27,86.86],[-1038.73,82.23],[-1031.89,78.17],[-1024.3,75.6],[-1016.71,73.02],[-1009.12,70.45],[-1001.53,67.88],[-993.94,65.3],[-986.35,62.73],[-978.77,60.42],[-971.23,63.14],[-963.69,65.87],[-956.16,68.6],[-948.62,71.32],[-941.09,74.05],[-933.55,76.77],[-928.11,82.58],[-922.81,88.59],[-917.5,94.6],[-912.2,100.61],[-906.9,106.62],[-900.69,111.26],[-893.09,113.79],[-885.54,115.84],[-878.68,111.7],[-871.81,107.56],[-864.95,103.43],[-858.08,99.29],[-851.22,95.15],[-844.36,91.02],[-837.49,86.88],[-830.63,82.74],[-823.76,78.61],[-816.9,74.47],[-810.03,70.33],[-803.17,66.2],[-796.31,62.06],[-789.44,57.92],[-782.58,53.79],[-775.71,49.65],[-768.85,45.51],[-761.99,41.38],[-755.12,37.24],[-748.26,33.1],[-741.39,28.97],[-733.96,26.53],[-725.99,25.69],[-718.15,25.6],[-710.88,28.99],[-703.62,32.38],[-696.36,35.77],[-689,38.65],[-681.01,38.07],[-673.56,35.9],[-666.89,31.46],[-660.67,26.56],[-656.14,19.95],[-651.61,13.34],[-647.08,6.73],[-642.54,.12],[-637.95,-6.41],[-630.38,-9.04],[-622.81,-11.67],[-615.24,-14.29],[-607.67,-16.92],[-600.09,-19.55],[-592.52,-22.17],[-587,-27.49],[-582.46,-34.1],[-577.92,-40.7],[-573.38,-47.31],[-568.84,-53.91],[-561.2,-55.71],[-553.31,-57.15],[-545.41,-58.14],[-537.44,-57.32],[-529.47,-56.5],[-521.49,-55.68],[-513.52,-54.86],[-505.55,-54.04],[-497.58,-53.22],[-489.61,-52.4],[-481.63,-51.58],[-473.68,-52.31],[-465.74,-53.34],[-457.79,-54.38],[-452.78,-60.63],[-447.77,-66.89],[-445.77,-74.28],[-445.39,-82.29],[-445.02,-90.29],[-444.64,-98.3],[-444.27,-106.3],[-443.89,-114.31],[-443.52,-122.31],[-443.14,-130.32],[-437.82,-135.68],[-431.37,-140.43],[-424.92,-145.18],[-417.14,-146.88],[-409.26,-148.34],[-401.38,-149.8],[-393.5,-151.26],[-385.62,-152.72],[-377.74,-154.18],[-369.91,-154.82],[-362.26,-152.43],[-355.1,-149.36],[-350.5,-142.8],[-345.89,-136.24],[-341.29,-129.68],[-336.68,-123.13],[-332.08,-116.57],[-327.47,-110.01],[-322.51,-103.86],[-315.34,-100.28],[-308,-97.78],[-300.08,-99],[-293.11,-102.46],[-286.74,-107.32],[-280.36,-112.18],[-273.99,-117.03],[-267.62,-121.89],[-261.24,-126.75],[-254.61,-130.75],[-246.61,-130.25],[-239.07,-128.71],[-233.41,-123.05],[-227.74,-117.38],[-222.07,-111.71],[-216.41,-106.05],[-210.74,-100.38],[-205.07,-94.71],[-199.41,-89.04],[-196.09,-81.91],[-193.51,-74.32],[-190.93,-66.74],[-188.35,-59.15],[-185.76,-51.56],[-183.18,-43.98],[-177.24,-39.58],[-169.59,-38],[-161.61,-38.74],[-153.63,-39.49],[-145.65,-40.23],[-137.67,-40.97],[-129.74,-41.37],[-122.29,-38.42],[-114.84,-35.47],[-107.38,-32.53],[-99.93,-29.58],[-92.48,-26.63],[-86.09,-22.24],[-81.04,-16.01],[-76,-9.78],[-71.26,-3.38],[-68.47,4.13],[-65.67,11.64],[-62.88,19.15],[-60.08,26.66],[-57.29,34.17],[-53.53,41.18],[-48.91,47.73],[-44.29,54.27],[-36.75,56.89],[-29.14,59.42],[-21.54,61.95],[-13.94,64.49],[-6.33,67.02],[1.27,69.56],[8.71,72.49],[15.91,76.01],[23.11,79.53],[30.31,83.05],[37.51,86.57],[44.71,90.09],[51.91,93.61],[59.11,97.13],[66.31,100.65],[73.51,104.17],[80.71,107.69],[87.91,111.21],[95.11,114.73],[102.31,118.25],[109.51,121.77],[116.71,125.29],[123.91,128.81],[131.11,132.33],[138.31,135.85],[145.51,139.37],[152.71,142.89],[159.91,146.41],[167.11,149.93],[174.31,153.45],[181.51,156.97],[189.01,159.78],[196.54,162.52],[204.07,165.26],[211.6,168],[219.13,170.74],[226.55,173.72],[233.44,177.8],[240.34,181.89],[247.23,185.98],[254.13,190.06],[261.02,194.15],[267.92,198.23],[274.81,202.32],[282.15,205.32],[289.93,207.27],[297.7,209.21],[305.48,211.15],[312.83,210.24],[319.5,205.96],[322.04,198.36],[322.09,190.74],[319.66,183.11],[317.22,175.47],[314.78,167.84],[312.34,160.2],[309.9,152.57],[307.46,144.93],[305.02,137.3],[302.58,129.67],[300.15,122.03],[297.71,114.4],[295.27,106.76],[292.83,99.13],[290.39,91.5],[287.95,83.86],[285.51,76.23],[283.07,68.59],[280.64,60.96],[278.21,53.32],[277.22,45.37],[276.23,37.42],[275.23,29.46],[274.36,21.51],[275.11,13.53],[275.85,5.55],[276.6,-2.43],[277.35,-10.41],[278.1,-18.39],[278.85,-26.37],[279.6,-34.35],[280.93,-42.16],[284.52,-49.32],[288.1,-56.49],[291.69,-63.66],[295.27,-70.83],[298.85,-78],[302.44,-85.16],[306.02,-92.33],[309.61,-99.5],[313.19,-106.67],[314.77,-114.5],[316.15,-122.39],[317.53,-130.29],[318.91,-138.18],[320.29,-146.08],[321.67,-153.97],[323.06,-161.86],[324.44,-169.76],[325.82,-177.65],[327.2,-185.55],[334.97,-187],[342.14,-185.3],[347.22,-179.67],[348.65,-171.78],[350.08,-163.9],[350.18,-155.98],[349.12,-148.04],[348.06,-140.09],[347.01,-132.15],[344.9,-124.43],[342.58,-116.76],[340.26,-109.09],[337.94,-101.42],[335.62,-93.75],[333.3,-86.07],[330.98,-78.4],[328.66,-70.73],[326.34,-63.06],[324.02,-55.39],[321.7,-47.72],[321.35,-39.76],[321.35,-31.74],[321.35,-23.73],[321.35,-15.71],[322.92,-7.87],[324.6,-.03],[326.27,7.81],[327.95,15.64],[329.63,23.48],[331.31,31.32],[332.99,39.15],[336.7,46.23],[340.56,53.25],[344.43,60.28],[348.29,67.3],[352.15,74.32],[357.21,80.05],[364.5,83.37],[371.8,86.69],[379.37,88.53],[387.37,88.09],[395.38,87.66],[403.38,87.22],[411.38,86.78],[419.38,86.35],[427.39,85.91],[435.39,85.47],[443.39,85.04],[451.39,84.6],[459.39,84.16],[467.4,83.73],[475.4,83.29],[483.4,82.86],[491.31,84.03],[499.22,85.35],[507.13,86.67],[514.58,89.59],[522,92.61],[529.43,95.63],[536.85,98.64],[544.28,101.66],[551.7,104.68],[559.13,107.69],[566.55,110.71],[574.25,112.58],[582.23,113.31],[590.22,114.03],[597.33,110.92],[604.21,106.82],[611.1,102.73],[617.99,98.63],[624.88,94.53],[631.77,90.44],[638.66,86.34],[645.55,82.25],[652.43,78.15],[659.32,74.05],[666.46,70.58],[674.28,68.81],[682.09,67.03],[689.91,65.25],[697.72,63.48],[705.54,61.7],[712.16,57.47],[718.39,52.43],[724.62,47.39],[730.85,42.34],[737.07,37.3],[743.3,32.26],[749.25,26.97],[753.5,20.17],[757.74,13.37],[761.99,6.58],[766.24,-.22],[771.01,-6.63],[776.25,-12.69],[781.49,-18.76],[786.73,-24.82],[791.96,-30.89],[797.2,-36.95],[802.44,-43.02],[805.81,-49.89],[806.58,-57.86],[807.35,-65.84],[808.12,-73.82],[808.89,-81.79],[809.67,-89.77],[810.44,-97.75],[811.21,-105.73],[813.55,-113.35],[816.27,-120.89],[818.99,-128.43],[821.71,-135.96],[824.43,-143.5],[827.16,-151.04],[829.88,-158.58],[832.6,-166.12],[835.32,-173.65],[838.9,-180.74],[843.55,-187.26],[848.21,-193.79],[852.87,-200.31],[857.53,-206.83],[862.19,-213.35],[866.85,-219.87],[871.5,-226.39],[876.16,-232.91],[880.82,-239.44],[885.48,-245.96],[890.14,-252.48],[894.79,-259],[899.45,-265.52],[904.11,-272.04],[908.77,-278.57],[913.43,-285.09],[918.08,-291.61],[922.74,-298.13],[926.19,-305.24],[928.45,-312.93],[930.71,-320.62],[932.97,-328.31],[935.23,-336],[937.5,-343.68],[939.76,-351.37],[942.02,-359.06],[944.28,-366.75],[949.39,-372.75],[955.25,-378.12],[962.69,-381.1],[970.13,-384.07],[977.57,-387.05],[984.65,-390.53],[989.74,-396.72],[994.84,-402.9],[999.93,-409.09],[1005.03,-415.28],[1010.12,-421.46],[1016.81,-425.65],[1023.98,-429.23],[1031.15,-432.81],[1038.32,-436.4],[1045.48,-439.98],[1052.99,-442.76],[1060.56,-445.39],[1068.13,-448.02],[1075.7,-450.66],[1083.27,-453.29],[1090.84,-455.92],[1098.72,-455.12],[1106.64,-453.9],[1114.57,-452.68],[1120.52,-448.05],[1125.52,-441.8],[1130.53,-435.54],[1135.54,-429.28],[1140.54,-423.02],[1145.55,-416.76],[1149.75,-410.03],[1152.8,-402.62],[1155.85,-395.21],[1158.9,-387.8],[1161.95,-380.39],[1165.01,-372.98],[1168.06,-365.57],[1171.11,-358.16],[1174.16,-350.74],[1179,-345.06],[1186.31,-341.79],[1193.62,-338.51],[1200.93,-335.23],[1208.25,-331.95],[1215.56,-328.67],[1222.87,-325.39],[1230.19,-322.12],[1236.71,-317.59],[1242.79,-312.37],[1247.49,-306.22],[1250.02,-298.62],[1252.55,-291.01],[1253.99,-283.32],[1252.81,-275.39],[1251.64,-267.46],[1250.46,-259.53],[1249.29,-251.6],[1248.11,-243.68],[1246.94,-235.75],[1249.14,-228.52],[1253.38,-221.73],[1258.81,-216.89],[1266.8,-216.32],[1274.8,-215.75],[1282.79,-215.18],[1290.65,-216.57],[1298.49,-218.22],[1306.34,-219.87],[1314.18,-221.52],[1322.02,-223.17],[1329.86,-224.82],[1337.7,-226.47],[1345.55,-228.12],[1353.39,-229.77],[1361.27,-231.19],[1369.22,-232.23],[1377.16,-233.27],[1385.11,-234.31],[1393.06,-235.35],[1401,-236.39],[1408.95,-237.43],[1416.9,-238.47],[1424.84,-239.52],[1432.79,-240.56],[1440.74,-241.6],[1448.68,-242.64],[1456.63,-243.68],[1464.57,-244.72],[1472.52,-245.76],[1480.47,-246.8],[1488.41,-247.84],[1496.36,-248.88],[1504.31,-249.92],[1512.25,-250.96],[1520.2,-252],[1527.81,-250.37],[1535.25,-247.4],[1542.69,-244.42],[1550.13,-241.44],[1557.57,-238.47],[1565.01,-235.49],[1572.43,-233.04],[1579.6,-236.62],[1586.77,-240.2],[1592.81,-244.97],[1596.7,-251.97],[1600.59,-258.98],[1602.09,-266.77],[1603.08,-274.72],[1604.08,-282.67],[1605.07,-290.63],[1606.06,-298.58],[1607.06,-306.53],[1609.49,-314.15],[1612.07,-321.74],[1614.65,-329.33],[1617.23,-336.92],[1619.8,-344.51],[1622.38,-352.09],[1624.96,-359.68],[1627.53,-367.27],[1630.11,-374.86],[1632.69,-382.45],[1635.27,-390.04],[1637.84,-397.63],[1640.42,-405.21],[1642.75,-412.87],[1644.23,-420.74],[1645.71,-428.62],[1647.18,-436.5],[1648.66,-444.37],[1650.14,-452.25],[1651.61,-460.13],[1653.09,-468.01],[1655.28,-475.6],[1659.53,-482.4],[1663.78,-489.2],[1668.03,-495.99],[1672.27,-502.79],[1678.28,-507.74],[1685.27,-511.66],[1692.26,-515.59],[1699.25,-519.51],[1706.23,-523.44],[1713.22,-527.36],[1720.21,-531.29],[1727.19,-535.21],[1734.18,-539.14],[1741.17,-543.07],[1748.15,-546.99],[1755.14,-550.92],[1762.13,-554.84],[1769.12,-558.77],[1776.1,-562.69],[1783.09,-566.62]],elevation:[3.52,3.12,2.73,2.37,2.03,1.72,1.44,1.19,.97,.78,.61,.47,.35,.26,.18,.11,.06,.02,0,0,.01,.04,.09,.14,.2,.28,.35,.44,.54,.65,.77,.92,1.08,1.27,1.48,1.71,1.96,2.24,2.54,2.87,3.23,3.61,4.01,4.42,4.84,5.27,5.7,6.12,6.55,6.98,7.41,7.83,8.26,8.67,9.08,9.49,9.89,10.28,10.68,11.08,11.48,11.88,12.28,12.69,13.09,13.49,13.89,14.29,14.68,15.07,15.44,15.81,16.18,16.53,16.88,17.22,17.56,17.89,18.21,18.54,18.86,19.18,19.5,19.82,20.14,20.46,20.77,21.07,21.37,21.66,21.93,22.2,22.45,22.7,22.94,23.18,23.42,23.65,23.88,24.11,24.33,24.55,24.77,24.98,25.18,25.37,25.56,25.74,25.92,26.08,26.22,26.36,26.48,26.59,26.7,26.78,26.87,26.94,27,27.06,27.11,27.16,27.22,27.27,27.32,27.37,27.43,27.48,27.53,27.58,27.62,27.66,27.69,27.73,27.77,27.81,27.86,27.92,27.99,28.07,28.15,28.25,28.36,28.48,28.6,28.74,28.89,29.05,29.22,29.4,29.6,29.81,30.04,30.28,30.53,30.8,31.07,31.34,31.62,31.88,32.14,32.39,32.65,32.9,33.16,33.42,33.69,33.97,34.25,34.52,34.8,35.08,35.36,35.64,35.92,36.21,36.51,36.81,37.12,37.43,37.74,38.06,38.38,38.71,39.03,39.36,39.69,40.03,40.37,40.71,41.05,41.39,41.72,42.04,42.35,42.65,42.94,43.21,43.46,43.7,43.92,44.14,44.37,44.6,44.85,45.12,45.41,45.71,46.03,46.35,46.67,46.99,47.31,47.63,47.94,48.25,48.56,48.86,49.17,49.47,49.76,50.05,50.33,50.61,50.88,51.15,51.42,51.68,51.94,52.22,52.51,52.82,53.15,53.49,53.85,54.21,54.58,54.94,55.31,55.67,56.04,56.41,56.78,57.15,57.53,57.9,58.28,58.65,59.03,59.4,59.77,60.15,60.52,60.89,61.25,61.61,61.97,62.31,62.65,62.98,63.31,63.63,63.95,64.26,64.58,64.91,65.24,65.59,65.95,66.32,66.71,67.11,67.52,67.94,68.36,68.78,69.2,69.62,70.04,70.46,70.88,71.3,71.72,72.15,72.58,73.01,73.44,73.86,74.26,74.66,75.04,75.41,75.78,76.13,76.48,76.81,77.12,77.42,77.71,77.98,78.26,78.52,78.8,79.07,79.35,79.64,79.95,80.26,80.58,80.92,81.27,81.63,82,82.39,82.8,83.22,83.65,84.09,84.54,85.01,85.49,85.98,86.49,87.02,87.55,88.09,88.63,89.16,89.68,90.19,90.69,91.19,91.68,92.15,92.61,93.05,93.47,93.89,94.29,94.69,95.09,95.5,95.91,96.31,96.71,97.09,97.44,97.77,98.08,98.36,98.64,98.9,99.15,99.4,99.65,99.89,100.13,100.37,100.59,100.83,101.08,101.36,101.68,102.05,102.46,102.92,103.41,103.92,104.44,104.97,105.5,106.02,106.53,107.03,107.52,107.99,108.45,108.9,109.34,109.77,110.21,110.64,111.06,111.49,111.91,112.32,112.72,113.11,113.49,113.84,114.18,114.51,114.84,115.17,115.51,115.87,116.25,116.62,117,117.36,117.7,118.02,118.32,118.61,118.89,119.17,119.44,119.72,120,120.29,120.6,120.91,121.22,121.55,121.88,122.22,122.57,122.93,123.31,123.68,124.06,124.44,124.81,125.19,125.56,125.94,126.33,126.73,127.14,127.57,128,128.44,128.88,129.32,129.75,130.17,130.57,130.96,131.34,131.71,132.07,132.43,132.78,133.13,133.47,133.78,134.07,134.32,134.56,134.77,134.98,135.18,135.39,135.61,135.85,136.1,136.39,136.7,137.03,137.39,137.76,138.14,138.52,138.91,139.29,139.68,140.06,140.45,140.83,141.22,141.61,141.99,142.36,142.72,143.06,143.39,143.7,144.01,144.33,144.66,145.03,145.41,145.83,146.26,146.7,147.15,147.6,148.04,148.47,148.88,149.28,149.66,150.03,150.39,150.73,151.07,151.4,151.73,152.06,152.39,152.73,153.06,153.41,153.75,154.11,154.47,154.85,155.23,155.61,156.01,156.4,156.8,157.2,157.6,158.01,158.44,158.87,159.32,159.79,160.26,160.75,161.24,161.72,162.2,162.67,163.13,163.58,164.01,164.43,164.83,165.21,165.57,165.92,166.26,166.59,166.91,167.22,167.52,167.83,168.13,168.44,168.74,169.05,169.36,169.66,169.97,170.28,170.59,170.9,171.22,171.54,171.86,172.19,172.52,172.85,173.18,173.51,173.84,174.16,174.49,174.81,175.14,175.48,175.81,176.16,176.52,176.88,177.25,177.63,178.02,178.4,178.8,179.19,179.59,179.99,180.4,180.8,181.2,181.59,181.97,182.35,182.72,183.09,183.46,183.84,184.23,184.63,185.03,185.43,185.83,186.22,186.61,186.99,187.37,187.75,188.14,188.55,188.96,189.38,189.81,190.22,190.63,191.01,191.37,191.7,192.02,192.32,192.61,192.89,193.17,193.45,193.72,193.98,194.25,194.51,194.77,195.04,195.3,195.57,195.84,196.13,196.42,196.72,197.04,197.37,197.7,198.04,198.4,198.76,199.13,199.5,199.87,200.25,200.61,200.97,201.31,201.64,201.96,202.27,202.57,202.86,203.16,203.46,203.77,204.09,204.41,204.74,205.06,205.39,205.7,206.02,206.31,206.6,206.85,207.09,207.29,207.47,207.63,207.77,207.9,208.02,208.13,208.22,208.31,208.4,208.47,208.55,208.62,208.7,208.78,208.88,208.99,209.12,209.27,209.45,209.65,209.89,210.17,210.48,210.83,211.19,211.55,211.92,212.27,212.61,212.93,213.24,213.54,213.85,214.16,214.49,214.84,215.2,215.57,215.97,216.37,216.78,217.19,217.61,218.02,218.43,218.84,219.25,219.66,220.08,220.5,220.94,221.39,221.85,222.34,222.83,223.33,223.83,224.29,224.71,225.09,225.43,225.75,226.08,226.43,226.82,227.24,227.68,228.14,228.58,229.02,229.44,229.85,230.25,230.66,231.08,231.5,231.93,232.36,232.79,233.22,233.66,234.1,234.54,234.98,235.41,235.83,236.24,236.64,237.02,237.4,237.77,238.15,238.53,238.92,239.31,239.71,240.11,240.5,240.89,241.28,241.65,242.02,242.39,242.75,243.12,243.49,243.88,244.27,244.67,245.07,245.46,245.86,246.24,246.62,246.99,247.35,247.71,248.07,248.42,248.77,249.12,249.46,249.8,250.13,250.45,250.77,251.09,251.4,251.71,252.03,252.34,252.65,252.97,253.29,253.62,253.94,254.26,254.57,254.87,255.15,255.42,255.67,255.92,256.17,256.42,256.69,256.98,257.28,257.6,257.93,258.27,258.6,258.92,259.23,259.52,259.8,260.07,260.32,260.58,260.83,261.08,261.34,261.61,261.87,262.14,262.41,262.67,262.93,263.19,263.46,263.73,264.02,264.33,264.66,265.02,265.39,265.78,266.18,266.59,267,267.41,267.82,268.22,268.61,269,269.37,269.73,270.06,270.37,270.66,270.92,271.16,271.37,271.56,271.75,271.94,272.15,272.4,272.68,273.01,273.37,273.77,274.17,274.59,274.99,275.38,275.74,276.07,276.38,276.67,276.94,277.2,277.46,277.73,278.02,278.33,278.68,279.06,279.48,279.92,280.39,280.88,281.36,281.84,282.3,282.74,283.17,283.58,283.98,284.37,284.76,285.15,285.54,285.93,286.32,286.7,287.07,287.43,287.78,288.13,288.48,288.83,289.19,289.54,289.9,290.25,290.6,290.94,291.26,291.56,291.84,292.1,292.34,292.58,292.83,293.1,293.4,293.75,294.14,294.56,295.02,295.49,295.96,296.4,296.8,297.15,297.44,297.68,297.87,298.05,298.24,298.48,298.8,299.19,299.66,300.17,300.69,301.2,301.68,302.13,302.53,302.9,303.24,303.57,303.88,304.19,304.49,304.79,305.08,305.36,305.62,305.88,306.13,306.37,306.63,306.9,307.19,307.49,307.81,308.13,308.46,308.78,309.12,309.46,309.83,310.21,310.62,311.04,311.47,311.89,312.3,312.71,313.1,313.48,313.86,314.22,314.58,314.92,315.25,315.58,315.89,316.18,316.46,316.72,316.97,317.22,317.46,317.7,317.95,318.2,318.45,318.71,318.98,319.25,319.53,319.81,320.11,320.41,320.72,321.04,321.37,321.72,322.07,322.42,322.77,323.11,323.45,323.78,324.12,324.45,324.78,325.1,325.41,325.71,325.99,326.25,326.49,326.71,326.92,327.13,327.33,327.54,327.75,327.97,328.2,328.44,328.69,328.94,329.2,329.46,329.72,329.99,330.27,330.55,330.85,331.15,331.46,331.78,332.1,332.42,332.75,333.09,333.44,333.81,334.18,334.56,334.95,335.34,335.73,336.11,336.49,336.86,337.23,337.58,337.93,338.27,338.62,338.95,339.28,339.59,339.88,340.13,340.33,340.46,340.52,340.5,340.39,340.21,339.98,339.72,339.43,339.14,338.85,338.56,338.28,337.99,337.69,337.38,337.06,336.72,336.37,336,335.61,335.22,334.84,334.46,334.12,333.8,333.51,333.25,333,332.77,332.53,332.29,332.03,331.76,331.46,331.16,330.84,330.51,330.17,329.82,329.47,329.11,328.74,328.36,327.98,327.59,327.2,326.81,326.43,326.07,325.72,325.4,325.11,324.83,324.57,324.32,324.07,323.84,323.6,323.36,323.11,322.86,322.6,322.34,322.08,321.82,321.58,321.35,321.14,320.95,320.79,320.64,320.5,320.36,320.21,320.04,319.84,319.62,319.37,319.11,318.83,318.54,318.24,317.93,317.62,317.32,317.01,316.71,316.42,316.13,315.85,315.58,315.32,315.06,314.8,314.55,314.3,314.05,313.8,313.55,313.3,313.03,312.77,312.5,312.22,311.94],elevationSource:`USGS 3DEP`,attribution:`OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright; vector tiles by OpenFreeMap; elevation: USGS 3DEP`,courseBuilder:{sections:[[{lat:34.77214317890497,lon:-83.91463701415495}],[{lat:34.77214317890497,lon:-83.91463701415495},{lon:-83.91487240791321,lat:34.77230483957425},{lon:-83.91533374786377,lat:34.77252516262877},{lon:-83.91577363014221,lat:34.77260447878439},{lon:-83.91605257987976,lat:34.77260447878439},{lon:-83.91640663146973,lat:34.77252516262877},{lon:-83.91677141189575,lat:34.77230483957425},{lon:-83.91703963279724,lat:34.77199638630967},{lon:-83.91740441322327,lat:34.77122084157949},{lon:-83.91793012619019,lat:34.77048054208363},{lon:-83.91870260238647,lat:34.769837181176115},{lon:-83.91958236694336,lat:34.76929076112424},{lon:-83.92086982727051,lat:34.7688765370613},{lon:-83.92163157463074,lat:34.768726710824424},{lon:-83.92281174659729,lat:34.768691457552706},{lon:-83.9235520362854,lat:34.7689382301386},{lon:-83.92374515533447,lat:34.76877959070379},{lon:-83.9241635799408,lat:34.76810096301277},{lon:-83.92413139343262,lat:34.76754571802432},{lon:-83.92422795295715,lat:34.767272500865175},{lon:-83.92448544502258,lat:34.767025723298886},{lon:-83.92474293708801,lat:34.76687589370226},{lon:-83.92534375190735,lat:34.766708436772404},{lon:-83.92584800720215,lat:34.76685826667301},{lon:-83.92616987228394,lat:34.76715792565831},{lon:-83.92636299133301,lat:34.76721080654278},{lon:-83.927983045578,lat:34.76640877615526},{lon:-83.92818689346313,lat:34.76639114902625},{lon:-83.92850875854492,lat:34.766514538850245},{lon:-83.92865896224976,lat:34.766505725297506},{lon:-83.92881989479065,lat:34.76641758971836},{lon:-83.92907738685608,lat:34.76610911445019},{lon:-83.929603099823,lat:34.76595928318969},{lon:-83.92983913421631,lat:34.76567724713803},{lon:-83.93007516860962,lat:34.7656419925638},{lon:-83.93080472946167,lat:34.76570368805882},{lon:-83.93105149269104,lat:34.76567724713803},{lon:-83.93118023872375,lat:34.76554504240707},{lon:-83.93121242523193,lat:34.76498096650927},{lon:-83.93141627311707,lat:34.76485757439278},{lon:-83.93199563026428,lat:34.764769437053815},{lon:-83.93216729164124,lat:34.76481350573506},{lon:-83.9325213432312,lat:34.76522775018887},{lon:-83.93267154693604,lat:34.76528944599349},{lon:-83.93281102180481,lat:34.765271818625436},{lon:-83.93326163291931,lat:34.76498978022481},{lon:-83.93343329429626,lat:34.764998593939424},{lon:-83.93389463424683,lat:34.76537758277722},{lon:-83.93406629562378,lat:34.765791824400225},{lon:-83.93417358398438,lat:34.76582707891046},{lon:-83.93463492393494,lat:34.765791824400225},{lon:-83.9350962638855,lat:34.765941655964696},{lon:-83.93527865409851,lat:34.766126741639425},{lon:-83.93545031547546,lat:34.766505725297506},{lon:-83.93557906150818,lat:34.76665555556606},{lon:-83.93612623214722,lat:34.76680538556268},{lon:-83.93805742263794,lat:34.767580971785435},{lon:-83.93852949142456,lat:34.767721986679305},{lon:-83.93910884857178,lat:34.76800401574425},{lon:-83.93945217132568,lat:34.76807452285992},{lon:-83.93955945968628,lat:34.76802164252882},{lon:-83.93960237503052,lat:34.767915881764964},{lon:-83.93910884857178,lat:34.766646742028385},{lon:-83.93906593322754,lat:34.76636470832568},{lon:-83.9391303062439,lat:34.765800638029205},{lon:-83.93949508666992,lat:34.765201309115625},{lon:-83.93964529037476,lat:34.76449621070489},{lon:-83.93977403640747,lat:34.764478583167474},{lon:-83.93985986709595,lat:34.76453146576847},{lon:-83.93990278244019,lat:34.76472536834902},{lon:-83.93985986709595,lat:34.76498978022481},{lon:-83.9395809173584,lat:34.76574775624128},{lon:-83.9395809173584,lat:34.76602979205205},{lon:-83.93970966339111,lat:34.76652335240205},{lon:-83.93994569778442,lat:34.76687589370226},{lon:-83.94018173217773,lat:34.766964028792046},{lon:-83.94136190414429,lat:34.766911147749454},{lon:-83.94161939620972,lat:34.766946401781624},{lon:-83.94230604171753,lat:34.76717555262357},{lon:-83.94254207611084,lat:34.76719317958505},{lon:-83.94333600997925,lat:34.76680538556268},{lon:-83.94380807876587,lat:34.766717250303486},{lon:-83.94425868988037,lat:34.76641758971836},{lon:-83.94447326660156,lat:34.76613555523265},{lon:-83.94488096237183,lat:34.76574775624128},{lon:-83.94494533538818,lat:34.765201309115625},{lon:-83.94522428512573,lat:34.764566720817015},{lon:-83.9461898803711,lat:34.76345617955555},{lon:-83.94640445709229,lat:34.76285683361989},{lon:-83.94651174545288,lat:34.76276869414468},{lon:-83.94683361053467,lat:34.76266292665025},{lon:-83.94713401794434,lat:34.76236325134673},{lon:-83.94752025604248,lat:34.76220459927504},{lon:-83.94801378250122,lat:34.76206357495538},{lon:-83.94829273223877,lat:34.76209883105787},{lon:-83.94863605499268,lat:34.762451391254814},{lon:-83.94893646240234,lat:34.76305074013406},{lon:-83.9495587348938,lat:34.76327990179088},{lon:-83.94970893859863,lat:34.763385668494834},{lon:-83.94979476928711,lat:34.763597201496225},{lon:-83.94970893859863,lat:34.76407314876752},{lon:-83.94981622695923,lat:34.764214169654224},{lon:-83.9501166343689,lat:34.7642317972481},{lon:-83.95093202590942,lat:34.7640907763915},{lon:-83.95273447036743,lat:34.76389687232033},{lon:-83.95327091217041,lat:34.76407314876752},{lon:-83.9534854888916,lat:34.76398501059097},{lon:-83.9535927772522,lat:34.76382636163605},{lon:-83.95365715026855,lat:34.763403296265665},{lon:-83.9540433883667,lat:34.76246901922512},{lon:-83.95417213439941,lat:34.76190492230778},{lon:-83.9543867111206,lat:34.76162287240366},{lat:34.761070602383484,lon:-83.95558330021787}]],resolution:5}}],Ui=1.6,Wi=.16,Gi=30;function Ki(e,t,n=!0){let r=n?L.euclideanModulo(t,1)*e.length:L.clamp(t,0,1)*(e.length-1),i=Math.floor(r)%e.length;if(!n&&e.length>1){let t=Math.min(i+1,e.length-1),n=e[t]-e[i],a=t=>{if(t===0)return e[1]-e[0];if(t===e.length-1)return e[t]-e[t-1];let n=e[t]-e[t-1],r=e[t+1]-e[t];return n*r<=0?0:2*n*r/(n+r)},o=r-i;return e[i]+n*(3*o**2-2*o**3)+a(i)*(o**3-2*o**2+o)+a(t)*(o**3-o**2)}return L.lerp(e[i],e[n?(i+1)%e.length:Math.min(i+1,e.length-1)],r-Math.floor(r))}var qi=class extends He{markers;reverse;closed;constructor(e,t=!1,n=!0){super(),this.markers=e,this.reverse=t,this.closed=n}getPoint(e,t=new I){let n=this.closed?L.euclideanModulo(this.reverse?-e:e,1)*this.markers.length:L.clamp(this.reverse?1-e:e,0,1)*(this.markers.length-1);if(!this.closed&&(n===0||n===this.markers.length-1)){let[e,r]=this.markers[n];return t.set(e,0,r)}let r=Math.floor(n),i=n-r,a=[(1-i)**3,3*i**3-6*i**2+4,-3*i**3+3*i**2+3*i+1,i**3];t.set(0,0,0);for(let e=0;e<4;e++){let n=r+e-1,i,o;if(!this.closed&&(n<0||n>=this.markers.length)){let e=n<0?0:this.markers.length-1,t=n<0?1:e-1,r=Math.abs(n-e);i=this.markers[e][0]+r*(this.markers[e][0]-this.markers[t][0]),o=this.markers[e][1]+r*(this.markers[e][1]-this.markers[t][1])}else[i,o]=this.markers[(n+this.markers.length)%this.markers.length];t.x+=i*a[e]/6,t.z+=o*a[e]/6}return t}getTangent(e,t=new I){return t.copy(this.getPoint(e+1e-5)).sub(this.getPoint(e-1e-5)).normalize()}};function Ji(e){let t=new qi(e.points,e.reverse,e.closed!==!1);return t.arcLengthDivisions=Math.max(1e3,e.points.length*100),t}function Yi(e){let t=e.getLength(),n=e instanceof qi&&!e.closed,r=Math.ceil(t/2),i=t/r,a=Array.from({length:r},(t,n)=>{let r=e.getTangentAt(Zi(e,n*i-4)),a=e.getTangentAt(Zi(e,n*i+4));return Math.atan2(r.z*a.x-r.x*a.z,r.dot(a))/8}),o=t=>e instanceof qi&&!e.closed?t<0||t>=r?0:a[t]:a[L.euclideanModulo(t,r)],s=e=>Math.abs(o(e))>1/100,c=a.findIndex((e,t)=>!s(t));if(!n&&c<0)return[];let l=[];for(let e=n?0:c+1;e<=(n?r-1:c+r);e++){if(!s(e)||s(e-1)&&Math.sign(o(e-1))===Math.sign(o(e)))continue;let a=Math.sign(o(e)),c=0,u=0,d=[];for(let t=e;s(t)&&Math.sign(o(t))===a&&t-e<r;t++)c+=Math.abs(o(t))*i,d.push(c),u=Math.max(u,Math.abs(o(t)));if(c<Math.PI/4||u<1/70)continue;let f=e=>n?L.clamp(e,0,t):L.euclideanModulo(e,t),p=f(e*i-4),m=d.findIndex(e=>e>=c/2),h=m===0?0:d[m-1],g=(c/2-h)/(d[m]-h),_=f((e+m+g-.5)*i),v=f((e+d.length)*i);l.every(e=>{let r=Math.abs(e.distance-p);return(n?r:Math.min(r,t-r))>24})&&l.push({distance:p,direction:a,apexDistance:_,exitDistance:v})}return l.sort((e,t)=>e.distance-t.distance)}function Xi(e,t){let n=e.getTangentAt(Zi(e,t-6)),r=e.getTangentAt(Zi(e,t+6)),i=Math.atan2(n.z*r.x-n.x*r.z,n.dot(r));return Math.abs(i)>12/75}function Zi(e,t){let n=e.getLength();return e instanceof qi&&!e.closed?L.clamp(t/n,0,1):L.euclideanModulo(t,n)/n}function Qi(e){let t=e.getLength(),n=Math.ceil(t/2),r=t/n,i=t=>e instanceof qi&&!e.closed?t<0||t>=n?-1:t:L.euclideanModulo(t,n),a=Array.from({length:n},(t,n)=>{let i=(n+.5)*r,a=e.getTangentAt(Zi(e,i-12)),o=e.getTangentAt(Zi(e,i+12));return Math.atan2(a.z*o.x-a.x*o.z,a.dot(o))/24}),o=a.map(e=>Math.abs(e)>=1/180?Math.sign(e):0);for(let e=0;e<n;e++)if(o[e])for(let t=1;t<=4;t++){let n=i(e+t);if(o[n]){if(o[n]===o[e])for(let n=1;n<t;n++)o[i(e+n)]=o[e];break}}let s=Array(n).fill(0),c=new Set;for(let e=0;e<n;e++){let t=o[e];if(!t||c.has(e))continue;let l=e;for(let e=0;e<n-1&&o[i(l-1)]===t;e++)l=i(l-1);let u=[],d=0,f=0;for(let e=0;e<n;e++){let n=i(l+e);if(o[n]!==t)break;c.add(n),u.push(n),d+=Math.max(0,a[n]*t)*r,f=Math.max(f,Math.abs(a[n]))}if(!(u.length*r<16||d<L.degToRad(12)||f<1/140)){for(let e of u)s[e]=t;for(let[e,n]of[[u[0],-1],[u[u.length-1],1]])for(let c=1;c*r<=4;c++){let r=i(e+c*n);if(r<0||a[r]*t<1/1e3||o[r])break;s[r]=t}}}return s.map((e,t)=>({distance:t*r,endDistance:(t+1)*r,direction:e})).filter(({direction:e})=>e!==0)}var $i=(e,t,n)=>(e.reverse?1-t:t)*n;function ea(e,t){return e.closed===!1?e.gates?$i(e,e.gates.start,t):45:e.reverse?t-5:5}function ta(e,t){let n=ea(e,t);return e.closed===!1?[n,e.gates?$i(e,e.gates.finish,t):t-45]:[n]}function na(e){let t=e.get(`reverse`);if(t===null||t===`0`||t===`false`)return!1;if(t===``||t===`1`||t===`true`)return!0;throw Error(`Invalid reverse course option: ${t}`)}function ra(e,t=e.closed===!1?4:Gi,n=0){let r=Ji(e),i=r.getLength(),a=ea(e,i)-t,o=e.closed===!1?L.clamp(a/i,0,1):L.euclideanModulo(a,i)/i,s=r.getPointAt(o),c=r.getTangentAt(o),l=Math.atan2(c.x,c.z);return{position:[s.x+Math.cos(l)*n,s.z-Math.sin(l)*n],heading:l}}function ia(e,t){let n=e.getLength(),r=e.getSpacedPoints(Math.ceil(n/2)).slice(0,-1),i=n/r.length;for(let e=0;e<r.length;e++)for(let n=e+1;n<r.length;n++)if(Math.min(n-e,r.length-(n-e))*i>t*2&&r[e].distanceTo(r[n])<t+10)return!1;return!0}var aa=[[84.01622954751265,0],[83.92487526054921,26.12612762443657],[69.15384490029841,48.13773738710717],[43.14160621121232,56.89100040112654],[19.06506027584704,56.21735976199199],[0,59.729722283795326],[-23.623736833566536,69.65958110175593],[-54.73388835855688,72.17778701416533],[-81.52414272569827,56.748656259050236],[-92.32171154378821,28.74009417125997],[-87.49982195923651,0],[-100,-30],[-145,-45],[-190,-40],[-245,-45],[-275,-80],[-275,-130],[-250,-175],[-200,-190],[-155,-175],[-115,-140],[-70,-115],[-25,-95],[27.363917446122286,-80.68829415215477],[53.8119932085613,-70.96208036913637],[70.2405650712074,-48.89419930583218],[78.21984842673713,-24.350131429050233]];function oa(e){if(!Number.isInteger(e)||e<0||e>4294967295)throw Error(`Course seed must be an unsigned 32-bit integer`);let t=e;return()=>{t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e^=e+Math.imul(e^e>>>7,61|e),((e^e>>>14)>>>0)/4294967296}}function sa(e){let t=oa(e);for(let n=0;n<256;n++){let n=.9+t()*.2,r=.9+t()*.2,i=t()*Math.PI*2,a=t()<.5?-1:1,o=t()*Math.PI*2,s=t()*Math.PI*2,c=aa.map(([e,t])=>{let c=(e+95)*n+15*Math.sin((t+55)/100+o),l=(t+55)*r+15*Math.sin((e+95)/150+s);return[a*(c*Math.cos(i)-l*Math.sin(i)),c*Math.sin(i)+l*Math.cos(i)]}),l={id:`random`,name:`Random Circuit (${e})`,width:17.5,points:c,generation:{type:`random`,seed:e}},u=(975+t()*100)/Ji(l).getLength();c.forEach(e=>{e[0]*=u,e[1]*=u});let d=Ji(l),f=d.getLength(),p=d.getSpacedPoints(Math.ceil(f/.5)).slice(0,-1),m=!0,h=[],g=0,_=0,v=1/0,y=-1/0;for(let e=0;e<p.length&&m;e++){let t=p[(e+p.length-1)%p.length],n=p[e],r=p[(e+1)%p.length],i=n.clone().sub(t),a=r.clone().sub(n),o=Math.atan2(i.z*a.x-i.x*a.z,i.dot(a)),s=(i.length()+a.length())/(2*Math.abs(o));h.push(s),s<38.2&&(m=!1),s<150&&(o>0?g+=f/p.length:_+=f/p.length);let c=Ci(n.x,n.z);v=Math.min(v,c),y=Math.max(y,c),Math.abs(Ci(r.x,r.z)-c)/a.length()>.12&&(m=!1)}if(!m||Math.min(g,_)<f*.1||y-v<10||y-v>20)continue;h.sort((e,t)=>e-t);let b=h[Math.floor(h.length/2)];if(!(b<60||b>110)&&ia(d,l.width))return l.bankingScale=1.2+(t()+t())*.4,l}throw Error(`Unable to generate a navigable course for seed ${e}`)}var ca=Hi.sort((e,t)=>e.name.localeCompare(t.name)),la=new Map;async function ua(e,t){let n=zi[e.id];if(!n||e.terrain)return t?.(1),e;let r=la.get(n);if(!r){let t={fraction:0,listeners:new Set},i=e=>{e!==t.fraction&&(t.fraction=e,t.listeners.forEach(t=>t(e)))};r={promise:(async()=>{let t=await fetch(n,{cache:`force-cache`});if(!t.ok)throw Error(`Unable to load ${e.name}: HTTP ${t.status}`);if(!t.body)throw Error(`Empty map response for ${e.name}`);let r=t.body.getReader(),a=new TextDecoder,o=[],s=0;try{for(;;){let{done:t,value:n}=await r.read();if(t)break;o.push(a.decode(n,{stream:!0})),s+=n.byteLength,i(Math.min(.99,Math.floor(s/Bi[e.id]*100)/100))}}finally{r.releaseLock()}o.push(a.decode());let c=JSON.parse(o.join(``));if(c.id!==e.id||!Array.isArray(c.points)||!c.terrain)throw Error(`Invalid map data for ${e.name}`);return i(1),c})(),progress:t},la.set(n,r)}try{return t&&(r.progress.listeners.add(t),t(r.progress.fraction)),{...await r.promise,reverse:e.reverse}}catch(e){throw la.delete(n),e}finally{t&&r.progress.listeners.delete(t)}}var da=ca.filter(({closed:e})=>e===!1),fa=ca.filter(({closed:e})=>e!==!1),pa=[{id:`sweeper`,name:`Sweeper Loop`,width:17.5,coneSpacing:6,bankingScale:3,points:[[0,0],[0,30],[-8,60],[0,90],[30,115],[65,110],[90,80],[85,45],[60,25],[65,-10],[40,-35],[10,-25]]},{id:`hillside`,name:`Hillside Circuit`,width:17.5,bankingScale:4,points:aa},{id:`hilly-drift`,name:`Hilly Drift`,width:17.5,points:[[-61.88367320531236,-204.52177657500891],[-89.18017635133648,-206.61585002562447],[-113.61744077245802,-192.38808424074043],[-124.87576766268573,-165.77666244806716],[-125.6557427687624,-140.96417789058538],[-130.21062590328663,-121.33948620731705],[-141.34052772392874,-96.94992962029923],[-144.3266661514913,-64.78527853066096],[-127.9364140048153,-37.092731936662695],[-98.40694631893439,-24.95523271419227],[-68.4831302192617,-27.60006170065486],[-36.946210607536194,-10.81672989596017],[-19.75158219788583,38.19064083060414],[-22.72233837107017,83.99250068812825],[-14.559242367977689,141.84063498857188],[23.2503436506156,179.5525132741382],[75.10117154460352,190.48087159008563],[120.56638775890984,174.40757653954924],[133.45532280628453,125.58802407737316],[115.5718702558673,75.93667589405798],[77.66235581807635,26.911776431816087],[50.78921768207196,-25.26280780915116],[30.301247568508014,-76.16238354533743],[17.531138807976387,-133.19516382556097],[9.254238250007111,-162.3996392751518],[-12.28241398419404,-183.43002428364392],[-37.07271277101184,-195.54119071713902]]},{id:`skidpad`,name:`Flat Skidpad`,width:62.5,coneSpacing:12,flat:!0,padRadius:250,points:Array.from({length:32},(e,t)=>{let n=-t/32*Math.PI*2;return[50*Math.cos(n),50*Math.sin(n)]})},...fa,...da],ma={rock:`Rock030`,gravel:`Ground037`,grass:`Grass004`},ha=new Map,ga=`
  // Sine-free hash: stays random at large world coordinates where fract(sin()) degenerates.
  vec4 terrainHash(vec2 p) {
    vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.103, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }
  float terrainNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 h = fract(sin(vec4(
      dot(cell, vec2(127.1, 311.7)),
      dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7)),
      dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7)),
      dot(cell + vec2(1.0), vec2(127.1, 311.7))
    )) * 43758.5453);
    return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
  }
  vec3 roadDirt(vec3 soil) {
    return dot(soil, vec3(0.2126, 0.7152, 0.0722)) * vec3(0.78, 0.53, 0.34);
  }
`;async function _a(){let e=new ke,t=await Promise.all(Object.entries(ma).map(async([t,n])=>({surface:t,maps:await Promise.all([`Color`,`NormalGL`,`Roughness`].map(async t=>{let r=await e.loadAsync(`./terrain/${n}_${t}.jpg`);return r.colorSpace=t===`Color`?i:``,r.wrapS=r.wrapT=O,r.anisotropy=8,r}))})));for(let{surface:e,maps:n}of t)ha.set(e,n)}function va(e,t,n,r,i){let a=ha.get(`gravel`)?.[0];if(!a)return!1;e.defines={...e.defines,DIRT_EDGE:t.toFixed(3),DIRT_MIN:n.toFixed(3),DIRT_MAX:r.toFixed(3),DIRT_FEATHER:`0.14`};let o=e.onBeforeCompile,s=e.customProgramCacheKey();return e.onBeforeCompile=function(e,t){o.call(this,e,t),e.uniforms.roadDirtMap={value:a},e.uniforms.roadDirtVisible=i,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
        attribute float lateral;
        attribute float structure;
        varying float vLateral;
        varying float vStructure;
        varying vec2 vDirtWorld;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        vLateral = lateral;
        vStructure = structure;
        vDirtWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
        uniform sampler2D roadDirtMap;
        uniform float roadDirtVisible;
        varying float vLateral;
        varying float vStructure;
        varying vec2 vDirtWorld;
        ${ga}`).replace(`#include <map_fragment>`,`#include <map_fragment>
        vec2 roadWorld = vDirtWorld;
        float edgeDistance = DIRT_EDGE - abs(vLateral);
        float drift = terrainNoise(roadWorld * 0.35) * 0.8 +
          terrainNoise(roadWorld * 1.4 + vec2(4.7, 1.3)) * 0.2;
        float ragged = (terrainNoise(roadWorld * 7.0) - 0.5) * 0.06 +
          (terrainNoise(roadWorld * 23.0 + vec2(9.2, 3.4)) - 0.5) * 0.02;
        float reach = DIRT_MIN + 0.15 + drift * drift * (DIRT_MAX - DIRT_MIN - 0.15) + ragged;
        float aa = max(fwidth(edgeDistance), DIRT_FEATHER);
        float cover = 1.0 - smoothstep(reach - aa - 0.03, reach + aa, edgeDistance);
        float beyond = edgeDistance - reach;
        // Crumbs cling to the edge, thinning out within ~30 cm.
        float crumbNoise = terrainNoise(roadWorld * 30.0) * 0.6 +
          terrainNoise(roadWorld * 70.0 + vec2(2.3, 8.1)) * 0.4;
        float crumbThreshold = 0.52 + smoothstep(0.0, 0.3, beyond) * 0.48;
        float crumbWidth = fwidth(crumbNoise) + 0.01;
        float clumps = smoothstep(crumbThreshold - crumbWidth, crumbThreshold + crumbWidth,
          crumbNoise);
        // Pebbles: at most one jittered stone per 12 cm cell, scattered up to ~1 m beyond the edge.
        float scatter = 1.0 - smoothstep(-0.1, 1.0, beyond);
        vec2 pebbleCell = floor(roadWorld * 8.0);
        vec4 ph = terrainHash(pebbleCell);
        vec2 pebbleOffset = (fract(roadWorld * 8.0) - 0.5 - (ph.xy - 0.5) * 0.5) / 8.0;
        float pebbleRadius = mix(0.008, 0.032, ph.z * ph.z) *
          (0.75 + 0.5 * terrainNoise(roadWorld * 160.0));
        float pebbleWidth = fwidth(roadWorld.x) * 0.7;
        float pebble = step(ph.w, 0.5 * scatter * scatter) *
          (1.0 - smoothstep(pebbleRadius - pebbleWidth, pebbleRadius + pebbleWidth,
            length(pebbleOffset)));
        clumps *= 0.35 * (1.0 - smoothstep(0.0, 0.3, beyond));
        float dirtCover = max(cover, max(pebble, clumps));
        // Fade out past the edge into the terrain's own dirt verge, and as roadside walls curve
        // up from the pavement, where a horizontal fade reads as a line.
        #ifdef FLAT_SHADED
          vec3 dirtNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        #else
          vec3 dirtNormal = normalize(vNormal);
        #endif
        float flatness = abs(dot(dirtNormal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)));
        dirtCover *= (1.0 - smoothstep(0.0, 0.6, -edgeDistance)) *
          smoothstep(0.8, 0.97, flatness + (drift - 0.5) * 0.1) *
          (1.0 - vStructure) * roadDirtVisible;
        // road dirt mask
        vec3 dirt = roadDirt(texture2D(roadDirtMap, roadWorld / 3.0).rgb);
        vec3 stone = mix(vec3(0.2, 0.17, 0.14), vec3(0.42, 0.36, 0.29), ph.w * 2.0) *
          (0.8 + 0.4 * terrainNoise(roadWorld * 90.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(dirt, stone, pebble * 0.85), dirtCover);`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, dirtCover);`)},e.customProgramCacheKey=()=>`${s}-road-dirt`,!0}function ya(e,t,n=.6){if(!va(e,1.8,1.9,2.4,t))return!1;e.defines={...e.defines,DIRT_HANDOFF:Math.max(.01,Math.min(.6,n)).toFixed(3)};let r=e.onBeforeCompile,i=e.customProgramCacheKey();return e.onBeforeCompile=function(e,t){r.call(this,e,t),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float mainRoad;
varying float vMainRoad;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vMainRoad = mainRoad;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying float vMainRoad;`).replace(`float edgeDistance = DIRT_EDGE - abs(vLateral);`,`float pavementDistance = vLateral;
        float edgeDistance = DIRT_EDGE - pavementDistance;`).replace(`float aa = max(fwidth(edgeDistance), DIRT_FEATHER);`,`float turningSoil = 1.0 - smoothstep(0.0, 6.0, vMainRoad);
reach += turningSoil * 0.45;
float aa = max(fwidth(edgeDistance), DIRT_FEATHER);`).replace(`// road dirt mask`,`dirtCover *= smoothstep(-1.0 - turningSoil * 0.45, -0.65, pavementDistance) *
          smoothstep(-DIRT_HANDOFF, 0.0, vMainRoad);`)},e.customProgramCacheKey=()=>`${i}-nearby`,!0}function ba(e,t=1){let n=e===`asphalt`?void 0:ha.get(e);if(n){let[e,r,i]=n.map(e=>{let n=e.clone();return n.repeat.setScalar(t),n});return new u({map:e,normalMap:r,roughnessMap:i,roughness:1,normalScale:new H(.75,.75)})}let r=document.createElement(`canvas`);r.width=r.height=256;let a=r.getContext(`2d`);if(!a)throw Error(`Unable to create terrain texture`);let o=a.createImageData(256,256),s=12345,c=()=>(s=Math.imul(s,1664525)+1013904223>>>0,s/4294967296),l=Array.from({length:64},c),d=(e,t)=>{let n=Math.floor(e),r=Math.floor(t),i=L.smoothstep(e-n,0,1),a=L.smoothstep(t-r,0,1),o=(e,t)=>l[(r+t)%8*8+(n+e)%8];return L.lerp(L.lerp(o(0,0),o(1,0),i),L.lerp(o(0,1),o(1,1),i),a)},f=e===`asphalt`?new Uint8Array(262144):void 0;for(let t=0;t<o.data.length;t+=4){let n=t/4%256,r=Math.floor(t/4/256),i=d(n/32,r/32),a=c(),s=e===`asphalt`?56+i*5+a*8:115+i*22+a*18;if(o.data[t]=s*(e===`grass`?.68:1),o.data[t+1]=s*(e===`grass`?.7:e===`asphalt`?1.02:.87),o.data[t+2]=s*(e===`grass`?.45:e===`asphalt`?1.04:.68),o.data[t+3]=255,f){let e=Math.round((.88+i*.08)*255);f[t]=f[t+1]=f[t+2]=e,f[t+3]=255}}if(a.putImageData(o,0,0),e===`gravel`)for(let e=0;e<2400;e++){let e=Math.floor(113+c()*30);a.fillStyle=`rgb(${e}, ${Math.floor(e*.9)}, ${Math.floor(e*.74)})`,a.beginPath(),a.ellipse(c()*256,c()*256,.5+c()*1.7,.5+c(),c()*Math.PI,0,Math.PI*2),a.fill()}if(e===`grass`)for(let e=0;e<9e3;e++){let e=c()*256,t=c()*256,n=80+c()*25;a.strokeStyle=c()<.45?`rgb(${Math.floor(n)}, ${Math.floor(n*.88)}, ${Math.floor(n*.58)})`:`rgb(${Math.floor(n*.7)}, ${Math.floor(n*.85)}, ${Math.floor(n*.48)})`,a.beginPath(),a.moveTo(e,t),a.lineTo(e+(c()-.5)*3,t-1-c()*4),a.stroke()}let p=new he(r);if(p.colorSpace=i,p.wrapS=p.wrapT=O,p.repeat.setScalar(t),p.anisotropy=8,f){let e=new ne(f,256,256);e.flipY=!0,e.wrapS=e.wrapT=O,e.repeat.setScalar(t),e.magFilter=q,e.minFilter=pe,e.generateMipmaps=!0,e.anisotropy=8,e.needsUpdate=!0;let n=new u({map:p,bumpMap:p,bumpScale:.012,roughnessMap:e,roughness:1});return n.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <map_fragment>`,`#include <map_fragment>
        #ifdef USE_MAP
          vec3 weathering = texture2D(map, vMapUv * 0.073).rgb;
          float wear = smoothstep(0.035, 0.065, dot(weathering, vec3(0.333333)));
          diffuseColor.rgb *= mix(0.92, 1.08, wear);
        #endif`)},n.customProgramCacheKey=()=>`asphalt-weathering`,n}let m=a.getImageData(0,0,256,256).data,h=new Uint8Array(262144),g=(e,t)=>{let n=((t+256)%256*256+(e+256)%256)*4;return(m[n]+m[n+1]+m[n+2])/765},_=new I;for(let e=0;e<256;e++)for(let t=0;t<256;t++){_.set((g(t-1,e)-g(t+1,e))*2,(g(t,e-1)-g(t,e+1))*2,1).normalize();let n=(e*256+t)*4;h[n]=Math.round((_.x*.5+.5)*255),h[n+1]=Math.round((_.y*.5+.5)*255),h[n+2]=Math.round((_.z*.5+.5)*255),h[n+3]=255}let v=new ne(h,256,256);return v.flipY=!0,v.wrapS=v.wrapT=O,v.repeat.setScalar(t),v.magFilter=q,v.minFilter=pe,v.generateMipmaps=!0,v.anisotropy=8,v.needsUpdate=!0,new u({map:p,normalMap:v,normalScale:new H(.45,.45),roughness:.96})}function xa(e,t){return e*65536+t}var Sa=4,Ca=class{mesh;buckets=new Map;constructor(e){if(this.mesh=e,!e)return;let{positions:t,indices:n}=e;for(let e=0;e<n.length;e+=3){let r=n[e]*3,i=n[e+1]*3,a=n[e+2]*3,o=Math.floor(Math.min(t[r],t[i],t[a])/Sa),s=Math.floor(Math.max(t[r],t[i],t[a])/Sa),c=Math.floor(Math.min(t[r+2],t[i+2],t[a+2])/Sa),l=Math.floor(Math.max(t[r+2],t[i+2],t[a+2])/Sa);for(let t=o;t<=s;t++)for(let n=c;n<=l;n++){let r=xa(t,n),i=this.buckets.get(r);i?i.push(e):this.buckets.set(r,[e])}}}isAsphalt(e){return this.heightAt(e)!==void 0}heightAt(e){if(!this.mesh)return;let{positions:t,indices:n}=this.mesh,r=this.buckets.get(xa(Math.floor(e.x/Sa),Math.floor(e.z/Sa)));if(r)for(let i of r){let r=n[i]*3,a=n[i+1]*3,o=n[i+2]*3,s=t[a]-t[r],c=t[a+2]-t[r+2],l=t[o]-t[r],u=t[o+2]-t[r+2],d=s*u-c*l;if(Math.abs(d)<1e-8)continue;let f=e.x-t[r],p=e.z-t[r+2],m=(f*u-p*l)/d,h=(s*p-c*f)/d;if(m<-1e-5||h<-1e-5||m+h>1.00001)continue;let g=t[r+1]+m*(t[a+1]-t[r+1])+h*(t[o+1]-t[r+1]);if(e.y===void 0||Math.abs(e.y-g)<2)return g}}},wa=class{segments;halfWidth;padRadius;asphaltSpans;buckets=new Map;constructor(e,t,n,r){this.segments=e,this.halfWidth=t,this.padRadius=n,this.asphaltSpans=r,e.forEach(({a:e,b:t},n)=>{for(let r=Math.floor((Math.min(e.x,t.x)-50)/16);r<=Math.floor((Math.max(e.x,t.x)+50)/16);r++)for(let i=Math.floor((Math.min(e.z,t.z)-50)/16);i<=Math.floor((Math.max(e.z,t.z)+50)/16);i++){let e=xa(r,i),t=this.buckets.get(e);t?t.push(n):this.buckets.set(e,[n])}})}nearest(e,t){let n=50,r=0,i=0,a=e,o=t,s=0;for(let c of this.buckets.get(xa(Math.floor(e/16),Math.floor(t/16)))??[]){let l=this.segments[c],u=l.b.x-l.a.x,d=l.b.z-l.a.z,f=L.clamp(((e-l.a.x)*u+(t-l.a.z)*d)/(u*u+d*d),0,1),p=e-l.a.x-f*u,m=t-l.a.z-f*d,h=Math.sqrt(p*p+m*m);h<n&&(n=h,a=l.a.x+f*u,o=l.a.z+f*d,r=(p*d-m*u)/Math.hypot(u,d),i=L.lerp(l.bank,this.segments[(c+1)%this.segments.length].bank,f),s=(c+f)/this.segments.length)}return{distance:n,across:r,bank:i,fraction:s,x:a,z:o}}isAsphalt(e){if(this.padRadius!==void 0)return Math.hypot(e.x,e.z)<=this.padRadius;let t=this.nearest(e.x,e.z);return t.distance<=this.halfWidth&&(!this.asphaltSpans||this.asphaltSpans.some(({start:e,end:n})=>t.fraction>=e&&t.fraction<=n))}};function Ta(e,t,n){let{minX:r,minZ:i,spacing:a,columns:o,rows:s,heights:c}=e,l=L.clamp((t-r)/a,0,o-1.000001),u=L.clamp((n-i)/a,0,s-1.000001),d=Math.floor(l),f=Math.floor(u),p=l-d,m=u-f,h=f*o+d;if(e.warpedCells?.[f*(o-1)+d])for(let r=Math.max(f-1,0);r<=Math.min(f+1,s-2);r++)for(let i=Math.max(d-1,0);i<=Math.min(d+1,o-2);i++){let a=Aa(e,i,r);for(let r=0;r<a.length;r+=3){let i=ka(e,a.slice(r,r+3),t,n,1e-6);if(i!==void 0)return i}}let g=c[h],_=c[h+1],v=c[h+o],y=c[h+o+1];return e.flippedCells?.[f*(o-1)+d]?p>=m?g+(_-g)*p+(y-_)*m:g+(v-g)*m+(y-v)*p:p+m<=1?g+(_-g)*p+(v-g)*m:y+(v-y)*(1-p)+(_-y)*(1-m)}function Ea(e,t,n){let r=.3;return new I(Ta(e,t-r,n)-Ta(e,t+r,n),2*r,Ta(e,t,n-r)-Ta(e,t,n+r)).normalize()}function Da(e,t){let n=(t-e.columns*e.rows)*3;return n>=0?{x:e.filletVertices[n],z:e.filletVertices[n+2]}:e.warpedVertices?.get(t)??{x:e.minX+t%e.columns*e.spacing,z:e.minZ+Math.floor(t/e.columns)*e.spacing}}function Oa(e,t){let n=(t-e.columns*e.rows)*3;return n>=0?e.filletVertices[n+1]:e.heights[t]}function ka(e,t,n,r,i=1/0){let[a,o,s]=t.map(t=>Da(e,t)),c=(o.x-a.x)*(s.z-a.z)-(s.x-a.x)*(o.z-a.z);if(Math.abs(c)<1e-9)return;let l=((n-a.x)*(s.z-a.z)-(s.x-a.x)*(r-a.z))/c,u=((o.x-a.x)*(r-a.z)-(n-a.x)*(o.z-a.z))/c,d=1-l-u;if(Math.min(d,l,u)<-i)return;let[f,p,m]=t.map(t=>Oa(e,t));return d*f+l*p+u*m}function Aa(e,t,n){let r=e.filletCells?.get(n*(e.columns-1)+t);if(r)return r;let i=n*e.columns+t,a=i,o=i+1,s=i+e.columns,c=s+1;return e.flippedCells?.[n*(e.columns-1)+t]?[a,s,c,a,c,o]:[a,s,o,o,s,c]}function ja(e,t){let n=[...e];if(!(t>0))throw Error(`Road elevation spacing must be positive`);let r=n=>(e[n+1]-e[n])/t;for(let i=0;i<e.length-2;i++){if(r(i)<=.35)continue;let a=i;for(;a>0&&r(a-1)>.1&&(i-a)*t<100;)a--;let o=!1;for(let s=i+1;s<e.length&&(s-a)*t<=300;s++){if(s<e.length-1&&r(s)<-.35&&(o=!0),!o||Math.abs(e[s]-e[a])>(s-a)*t*.15||s<e.length-1&&r(s)<-.1)continue;let c=0;for(let t=a+1;t<s;t++){let n=e[a]+(e[s]-e[a])*(t-a)/(s-a);c=Math.max(c,e[t]-n)}if(c<10)break;for(let t=a+1;t<s;t++)n[t]=e[a]+(e[s]-e[a])*(t-a)/(s-a);i=s;break}}return n}var Ma=2500;function Na(e){let t=6-Math.max(0,Math.min(6,e));return 6-Math.sqrt(Math.max(0,36-t*t))}function Pa(e){let t=e.map(e=>({...e,points:e.points.filter((e,t,n)=>!t||Math.hypot(e[0]-n[t-1][0],e[1]-n[t-1][1])>=.01)})).filter(e=>e.points.length>=2),n=[],r=(e,t)=>Math.hypot(e[0]-t[0],e[1]-t[1])<.1;for(;t.length;){let i=t.shift();for(let n of[!1,!0]){for(n&&i.points.reverse();;){let a=i.points.at(-1);if(e.reduce((e,t)=>e+Number(r(a,t.points[0]))+Number(r(a,t.points.at(-1))),0)!==2)break;let o=t.flatMap((e,t)=>[!1,!0].flatMap(n=>r(a,n?e.points.at(-1):e.points[0])?[{i:t,flip:n,other:e}]:[]));if(o.length!==1||Math.abs(o[0].other.width-i.width)>.01||o[0].other.roadClass!==i.roadClass||(o[0].other.oneway??0)*(o[0].flip?-1:1)!=(i.oneway??0)*(n?-1:1)||o[0].other.centerline!==i.centerline||o[0].other.lanes!==i.lanes||o[0].other.service!==i.service||o[0].other.structure!==i.structure||(o[0].other.layer??0)!==(i.layer??0))break;let{i:s,flip:c,other:l}=o[0];t.splice(s,1);let u=c?[...l.points].reverse():l.points;i.points.push(...u.slice(1))}n&&i.points.reverse()}n.push(i)}return n}function Fa(e,t,n){let r=n*3,i=Math.exp(-4.5),a=t.at(-1),o=e[0],s=e.at(-1);return e.map((c,l)=>{let u=t[l],d=0,f=0,p=(e,t)=>{let r=Math.max(0,Math.exp(-.5*(e/n)**2)-i);d+=t*r,f+=r},m=n=>{p(t[n]-u,e[n]);let i=-t[n]-u;n>0&&i>=-r&&p(i,2*o-e[n]);let c=2*a-t[n]-u;n<e.length-1&&c<=r&&p(c,2*s-e[n])};for(let e=l;e>=0&&u-t[e]<=r;e--)m(e);for(let n=l+1;n<e.length&&t[n]-u<=r;n++)m(n);return d/f})}function Ia(e,t,n){return e.map(e=>{let r=0,i=0;for(let a of t){let t=1-La(Math.abs(e-a.distance),0,n);r+=a.delta*t,i+=t}return i?r/Math.max(1,i):0})}var La=(e,t,n)=>{let r=Math.min(1,Math.max(0,(e-t)/(n-t)));return r*r*(3-2*r)};function Ra(e,t,n){let r=e.filter((t,n)=>n===0||Math.hypot(t[0]-e[n-1][0],t[1]-e[n-1][1])>=.01);if(r.length<3)return r;let i=Math.min(Math.max(t,3),10),a=i*3,o=Math.min(2,i/3),s=[r[0]],c=[0],l=[0];for(let e=1;e<r.length;e++){let[t,n]=r[e-1],[i,a]=r[e],u=Math.hypot(i-t,a-n),d=Math.max(1,Math.ceil(u/o-1e-6)),f=c.at(-1);for(let e=1;e<d;e++)s.push([t+(i-t)*e/d,n+(a-n)*e/d]),c.push(f+u*e/d);s.push(r[e]),c.push(f+u),l.push(s.length-1)}let u=l.slice(1,-1).filter(e=>n?.has(Ba(s[e]))),d=[0,1].map(e=>{let t=s.map(t=>t[e]),n=Fa(t,c,i),r=Ia(c,u.map(e=>({distance:c[e],delta:t[e]-n[e]})),a);return n.map((e,t)=>e+r[t])});for(let e of[0,...u,s.length-1])[d[0][e],d[1][e]]=s[e];let f=s.map((e,t)=>[d[0][t],d[1][t]]),p=[0,...u,s.length-1],m=s.map(()=>!1);for(let e of p)m[e]=!0;let h=p.slice(1).map((e,t)=>[p[t],e]);for(;h.length;){let[e,t]=h.pop(),n=f[e],r=f[t],i=[];for(let a=e+1;a<t;a++)i.push(za(f[a],n,r));let a=Math.max(0,...i);if(a<=.02)continue;let o=[e];i.forEach((t,n)=>{t>=a-1e-9&&o.push(e+1+n)}),o.push(t);for(let e=1;e<o.length;e++)m[o[e]]=!0,h.push([o[e-1],o[e]])}return f.filter((e,t)=>m[t])}function za([e,t],[n,r],[i,a]){let o=i-n,s=a-r,c=Math.min(1,Math.max(0,((e-n)*o+(t-r)*s)/(o*o+s*s||1)));return Math.hypot(e-n-c*o,t-r-c*s)}var Ba=([e,t])=>`${e.toFixed(2)},${t.toFixed(2)}`;function Va(e){let t=new Map;return e.forEach((e,n)=>{if(!e.structure)for(let r of e.points){let e=Ba(r),i=t.get(e)??new Set;i.add(n),t.set(e,i)}}),new Set([...t].filter(([,e])=>e.size>1).map(([e])=>e))}function Ha(e){let t=Va(e),n=new Map,r=new Set;for(let t of e){for(let e of t.points.slice(1,-1))r.add(Ba(e));for(let e of[!1,!0]){let r=Ba(e?t.points.at(-1):t.points[0]),i=n.get(r)??[];i.push({road:t,last:e}),n.set(r,i)}}let i=new Map,a=new Set;for(let o of e){if(a.has(o))continue;if(a.add(o),o.structure){i.set(o,Ra(o.points,o.width,t));continue}let e=[{road:o,reverse:!1}],s=t=>{for(;;){let i=t?e.at(-1):e[0],o=Ba(t===i.reverse?i.road.points[0]:i.road.points.at(-1)),s=n.get(o);if(s.length!==2||r.has(o))break;let c=s.find(e=>e.road!==i.road);if(!c||a.has(c.road)||c.road.structure||(c.road.layer??0)!==(i.road.layer??0))break;a.add(c.road);let l={road:c.road,reverse:t?c.last:!c.last};t?e.push(l):e.unshift(l)}};s(!1),s(!0);let c=Ra(e.flatMap(({road:e,reverse:t},n)=>{let r=t?[...e.points].reverse():e.points;return n?r.slice(1):r}),Math.max(...e.map(({road:e})=>e.width)),t);if(e.length===1){i.set(o,c);continue}let l=0;for(let{road:t,reverse:n}of e){let e=Ba(n?t.points[0]:t.points.at(-1)),r=c.findIndex((t,n)=>n>l&&Ba(t)===e);if(r<0)throw Error(`Smoothed road lost a fragment endpoint`);let a=c.slice(l,r+1);i.set(t,n?a.reverse():a),l=r}}return i}function Ua(e,t,n){if(t<e.minX||t>=e.maxX||n<e.minZ||n>=e.maxZ)return 255;let r=Math.floor((t-e.minX)/(e.maxX-e.minX)*e.columns),i=Math.floor((n-e.minZ)/(e.maxZ-e.minZ)*e.rows);return e.cover[i*e.columns+r]}function Wa(e){return{...e,roads:Pa(e.roads)}}function Ga(e){let t=e=>Array.isArray(e)&&e.length===2&&e.every(Number.isFinite),n=e=>Array.isArray(e)&&e.length>=2&&e.every(t),r=e=>Array.isArray(e)&&e.length>0&&e.every(e=>n(e)&&e.length>=3),i=e=>Number.isFinite(e)&&e>0&&e<=100;if(!e||e.version!==1||!Array.isArray(e.buildings)||!Array.isArray(e.water)||!Array.isArray(e.waterways)||!Array.isArray(e.vegetation)||!Array.isArray(e.roads)||e.bounds!==void 0&&(!Number.isFinite(e.bounds.minX)||!Number.isFinite(e.bounds.minZ)||!Number.isFinite(e.bounds.maxX)||!Number.isFinite(e.bounds.maxZ)||e.bounds.minX>=e.bounds.maxX||e.bounds.minZ>=e.bounds.maxZ)||e.canopy!==void 0&&(!e.canopy||typeof e.canopy.source!=`string`||!Number.isInteger(e.canopy.year)||![e.canopy.minX,e.canopy.minZ,e.canopy.maxX,e.canopy.maxZ].every(Number.isFinite)||e.canopy.maxX<=e.canopy.minX||e.canopy.maxZ<=e.canopy.minZ||!Number.isInteger(e.canopy.columns)||!Number.isInteger(e.canopy.rows)||e.canopy.columns<1||e.canopy.rows<1||e.canopy.columns*e.canopy.rows>1e6||!Array.isArray(e.canopy.cover)||e.canopy.cover.length!==e.canopy.columns*e.canopy.rows||!e.canopy.cover.every(e=>Number.isInteger(e)&&(e>=0&&e<=100||e===255)))||!e.buildings.every(e=>e&&r(e.rings)&&Number.isFinite(e.height)&&e.height>0&&e.height<=1e3&&(e.buildingType===void 0||typeof e.buildingType==`string`)&&(e.roofShape===void 0||typeof e.roofShape==`string`))||!e.water.every(e=>e&&r(e.rings))||!e.waterways.every(e=>e&&n(e.points)&&i(e.width))||!e.vegetation.every(e=>e&&r(e.rings)&&[`trees`,`scrub`,`grass`].includes(e.kind))||e.parking!==void 0&&(!Array.isArray(e.parking)||!e.parking.every(e=>e&&r(e.rings)))||e.stopSigns!==void 0&&(!Array.isArray(e.stopSigns)||!e.stopSigns.every(e=>e&&t(e.point)&&t(e.direction)&&Math.abs(Math.hypot(...e.direction)-1)<.001&&i(e.width)&&(e.oneway===void 0||typeof e.oneway==`boolean`)))||!e.roads.every(e=>e&&n(e.points)&&i(e.width)&&(e.roadClass===void 0||typeof e.roadClass==`string`)&&(e.centerline===void 0||e.centerline===`double-yellow`||e.centerline===`dashed-yellow`)&&(e.oneway===void 0||e.oneway===-1||e.oneway===1)&&(e.structure===void 0||e.structure===`bridge`||e.structure===`tunnel`)&&(e.layer===void 0||Number.isInteger(e.layer))&&(e.lanes===void 0||Number.isInteger(e.lanes)&&e.lanes>0&&e.lanes<=20)&&(e.service===void 0||typeof e.service==`string`)))throw Error(`Invalid saved course scenery`)}var Ka=30,qa=class{cells=new Map;junctionCells=new Map;constructor(e,t){let n=Va(e),r=Ha(e),i=new Set(e.filter(e=>e.structure===`bridge`).flatMap(e=>[e.points[0],e.points.at(-1)].map(Ba))),a=new Map,o=e.filter(e=>!e.structure).map((e,o)=>{let s=r.get(e),c=[{x:s[0][0],z:s[0][1],height:0,distance:0}];for(let e=1;e<s.length;e++){let[t,n]=s[e-1],[r,i]=s[e],a=Math.hypot(r-t,i-n),o=Math.max(1,Math.ceil(a/2-1e-6)),l=c.at(-1).distance;for(let e=1;e<=o;e++)c.push({x:t+(r-t)*e/o,z:n+(i-n)*e/o,distance:l+a*e/o,height:0})}let l=c.map(e=>e.distance),u=l.at(-1)/Math.max(1,c.length-1),d=Fa(ja(c.map(e=>t(e.x,e.z)),u||1),l,15);for(let t=0;t<c.length;t++){c[t].height=d[t];let r=Ba([c[t].x,c[t].z]);if(n.has(r)){let n=a.get(r)??[],i=Math.max(0,t-1),s=Math.min(c.length-1,t+1),u=c[s].x-c[i].x,f=c[s].z-c[i].z,p=Math.hypot(u,f),m=(d[s]-d[i])/(l[s]-l[i]);n.push({...c[t],slopeX:m*u/p,slopeZ:m*f/p,through:t>0&&t<c.length-1,width:e.width,roadIndex:o}),a.set(r,n)}}let f=[0,c.length-1].flatMap(e=>{let t=c[e];if(!i.has(Ba([t.x,t.z])))return[];let n=c[e?e-1:1],r=Math.hypot(t.x-n.x,t.z-n.z);return r?[{x:t.x,z:t.z,distance:t.distance,dx:(t.x-n.x)/r,dz:(t.z-n.z)/r}]:[]}),p=e.oneway&&[`motorway`,`trunk`].includes(e.roadClass??``)?{key:`${e.roadClass}:${e.layer??0}`,direction:e.oneway}:void 0;return{samples:c,width:e.width,endPlanes:f,carriageway:p}}),s=new Map([...a].map(([e,t])=>[e,t.reduce((e,t)=>e+t.height,0)/t.length]));for(let[e,{samples:t,width:n}]of o.entries()){let r=Ia(t.map(e=>e.distance),t.flatMap(e=>{let t=s.get(Ba([e.x,e.z]));return t===void 0?[]:[{distance:e.distance,delta:t-e.height}]}),25);t.forEach((e,t)=>e.height+=r[t]);for(let r=1;r<t.length;r++){let i=t[r-1],a=t[r],s={a:i,b:a,width:n,carriageway:o[e].carriageway,endPlanes:o[e].endPlanes.filter(e=>Math.min(Math.abs(i.distance-e.distance),Math.abs(a.distance-e.distance))<n/2)},c=n/2+20;for(let t=Math.floor((Math.min(i.x,a.x)-c)/32);t<=Math.floor((Math.max(i.x,a.x)+c)/32);t++)for(let n=Math.floor((Math.min(i.z,a.z)-c)/32);n<=Math.floor((Math.max(i.z,a.z)+c)/32);n++){let r=xa(t,n),i=this.cells.get(r)??new Map,a=i.get(e)??[];a.push(s),i.set(e,a),this.cells.set(r,i)}}}for(let e of a.values()){let t=[...e].sort((e,t)=>Number(t.through)-Number(e.through)||t.width-e.width)[0],n={...t,height:s.get(Ba([t.x,t.z])),inner:Math.min(15,Math.max(...e.map(e=>e.width))/2+7),roads:new Set(e.map(e=>e.roadIndex))},{x:r,z:i}=n;for(let e=Math.floor((r-Ka)/32);e<=Math.floor((r+Ka)/32);e++)for(let t=Math.floor((i-Ka)/32);t<=Math.floor((i+Ka)/32);t++){let r=xa(e,t),i=this.junctionCells.get(r)??[];i.push(n),this.junctionCells.set(r,i)}}}bankingWeight(e,t){let n=Ka;for(let r of this.junctionCells.get(xa(Math.floor(e/32),Math.floor(t/32)))??[])n=Math.min(n,Math.hypot(e-r.x,t-r.z));return L.smoothstep(n,8,Ka)}pavementDistance(e,t){let n=1/0;for(let r of this.cells.get(xa(Math.floor(e/32),Math.floor(t/32)))?.values()??[])for(let{a:i,b:a,width:o,endPlanes:s}of r){let r=a.x-i.x,c=a.z-i.z,l=r*r+c*c;if(!l)continue;let u=Math.min(1,Math.max(0,((e-i.x)*r+(t-i.z)*c)/l)),d=e-i.x-u*r,f=t-i.z-u*c,p=d*d+f*f;if(!s.length){let e=n+o/2;if(e<=0||p>=e*e)continue}let m=Math.sqrt(p)-o/2;for(let n of s)m=Math.max(m,(e-n.x)*n.dx+(t-n.z)*n.dz);n=Math.min(n,m)}return n}heightAt(e,t,n){let r=n,i=1/0,a=0,o=1/0,s=0,c=0,l=0,u=[],d=this.junctionCells.get(xa(Math.floor(e/32),Math.floor(t/32)))??[],f=(n,r)=>{let i=0,a=0,o=0;for(let r of d){if(!r.roads.has(n))continue;let s=Math.hypot(e-r.x,t-r.z),c=1-L.smoothstep(s,r.inner,Ka);i+=(r.height+(e-r.x)*r.slopeX+(t-r.z)*r.slopeZ)*c,a+=c,o=Math.max(o,c)}return a?L.lerp(r,i/a,o):r};for(let[n,d]of this.cells.get(xa(Math.floor(e/32),Math.floor(t/32)))?.entries()??[]){let p=1/0,m=0,h=0,g=0,_=0,v=0,y=d[0].width;for(let{a:n,b:r}of d){let i=r.x-n.x,a=r.z-n.z,o=i*i+a*a;if(!o)continue;let s=Math.min(1,Math.max(0,((e-n.x)*i+(t-n.z)*a)/o)),c=e-n.x-s*i,l=t-n.z-s*a,u=c*c+l*l;u>=p||(p=u,m=L.lerp(n.height,r.height,s),h=n.x+s*i,g=n.z+s*a,_=i/Math.sqrt(o),v=a/Math.sqrt(o))}let b=Math.sqrt(p),x=1-L.smoothstep(b,y/2+7,y/2+20);if(!x)continue;let S=b-y/2;m=f(n,m);let C=d[0].carriageway;C&&S>0&&S<12&&u.push({x:h,z:g,dx:_,dz:v,edge:S,height:m,...C});let w=x/Math.max(.001,S)**2;s+=m*w,c+=w,l=Math.max(l,x),o=Math.min(o,S);let T=S<=0?b/(y/2)-1:b/(y/2+7);T>=i||(i=T,a=x,r=m)}if(!a)return n;if(o>0){let r=0,i=1/0;for(let n=0;n<u.length;n++){let a=u[n];for(let o=n+1;o<u.length;o++){let n=u[o],s=a.edge+n.edge;a.key!==n.key||s>12||s>=i||(a.dx*n.dx+a.dz*n.dz)*a.direction*n.direction>-.95||(a.x-e)*(n.x-e)+(a.z-t)*(n.z-t)>=0||(r=L.lerp(a.height,n.height,a.edge/s),i=s)}}return i<1/0?r:L.lerp(n,s/c,l)}return L.lerp(n,r,a)}},Ja=6,Ya=.065,Xa=1.065,Za=32;function Qa(e,t,n){let{a:r,b:i}=e,a=i.x-r.x,o=i.z-r.z,s=L.clamp(((t-r.x)*a+(n-r.z)*o)/(a*a+o*o),0,1);return{t:s,distance:Math.hypot(t-r.x-a*s,n-r.z-o*s)}}var $a=class{cells=new Map;constructor(e,t){for(let n of e)for(let e=1;e<n.points.length;e++){let[r,i]=n.points[e-1],[a,o]=n.points[e],s=Math.hypot(a-r,o-i);if(!s)continue;let c=Math.ceil(s/2),l={x:r,z:i,height:t(r,i)-Xa};for(let e=1;e<=c;e++){let s=L.lerp(r,a,e/c),u=L.lerp(i,o,e/c),d={x:s,z:u,height:t(s,u)-Xa},f={a:l,b:d,halfWidth:n.width/2},p=f.halfWidth+Ja+8;for(let e=Math.floor((Math.min(l.x,d.x)-p)/Za);e<=Math.floor((Math.max(l.x,d.x)+p)/Za);e++)for(let t=Math.floor((Math.min(l.z,d.z)-p)/Za);t<=Math.floor((Math.max(l.z,d.z)+p)/Za);t++){let n=`${e},${t}`,r=this.cells.get(n)??[];r.push(f),this.cells.set(n,r)}l=d}}}segmentsAt(e,t){return this.cells.get(`${Math.floor(e/Za)},${Math.floor(t/Za)}`)??[]}near(e,t,n){return this.segmentsAt(e,t).some(r=>Qa(r,e,t).distance<=r.halfWidth+Ja+n)}bedHeightAt(e,t){let n=1/0,r;for(let i of this.segmentsAt(e,t)){let{t:a,distance:o}=Qa(i,e,t);o>=n||(n=o,r=L.lerp(i.a.height,i.b.height,a))}return r}heightAt(e,t,n,r){let i=L.smoothstep(r,1,5);if(!i)return n;let a=n;for(let r of this.segmentsAt(e,t)){let{t:o,distance:s}=Qa(r,e,t),c=i*(1-L.smoothstep(s,r.halfWidth,r.halfWidth+Ja));if(!c)continue;let l=L.lerp(r.a.height,r.b.height,o);a=Math.min(a,L.lerp(n,Math.min(n,l),c))}return a}};function eo(e,t,n,r,i,a){if(a?.lines.length){n=n.slice();for(let{points:i,width:o}of a.lines){let s=o/2+6+r*Math.SQRT2;for(let o=1;o<i.length;o++){let[c,l]=i[o-1],[u,d]=i[o],f=Math.max(1,Math.ceil(Math.hypot(u-c,d-l)/r));for(let i=0;i<=f;i++){let o=c+(u-c)*i/f,p=l+(d-l)*i/f,m=Math.max(0,Math.ceil((o-s-a.minX)/r)),h=Math.min(e-1,Math.floor((o+s-a.minX)/r)),g=Math.max(0,Math.ceil((p-s-a.minZ)/r)),_=Math.min(t-1,Math.floor((p+s-a.minZ)/r));for(let t=g;t<=_;t++)for(let i=m;i<=h;i++)Math.hypot(a.minX+i*r-o,a.minZ+t*r-p)<=s&&(n[t*e+i]=0)}}}}let o=Float32Array.from(n,e=>e<32?e:1/0);for(let n of[1,-1])for(let i=n===1?0:t-1;i>=0&&i<t;i+=n)for(let a=n===1?0:e-1;a>=0&&a<e;a+=n){let s=i*e+a,c=a-n;c>=0&&c<e&&(o[s]=Math.min(o[s],o[i*e+c]+r));let l=i-n;if(!(l<0||l>=t))for(let t=-1;t<=1;t++)a+t<0||a+t>=e||(o[s]=Math.min(o[s],o[l*e+a+t]+r))}let s=[],c=(a,l,u)=>{if(u===1){s.push(...i(a,l));return}let d=a+u<e&&l+u<t,f=u<=32?32:u*r*2,p=u<=32?n:o;for(let t=0;d&&t<=u;t++)for(let n=0;n<=u;n++)if(p[(l+t)*e+a+n]<f){d=!1;break}if(d){let t=(l+u/2)*e+a+u/2;for(let n=0;n<u;n++){let r=l*e+a+n,i=(l+u)*e+a+n,o=(l+n)*e+a,c=o+u;s.push(t,r+1,r,t,i,i+1),s.push(t,o,o+e,t,c+e,c)}return}let m=u/2;for(let n of[0,m])for(let r of[0,m])a+r<e-1&&l+n<t-1&&c(a+r,l+n,m)};for(let n=0;n<t-1;n+=128)for(let t=0;t<e-1;t+=128)c(t,n,128);return new Uint32Array(s)}var to={deckThickness:.7,edgeWidth:.4,curbHeight:.45,railingHeight:1.15,postSpacing:2.5,pierSpacing:28,trussMinLength:120,trussMinClearance:12,trussPanelLength:12,trussPierSpacing:120,trussMaxDepth:20,trussBeamWidth:.32,pierEmbedDepth:2};function no(e,t,n,r,i={}){let a=e.structures?.filter(({type:e})=>e===`bridge`);if(!a?.length||e.flat)return;let o=i.route??Ji({...e,reverse:!1}),s=o.getLength(),c=e.width/2+(e.shoulderWidth??1.6),{deckThickness:l,edgeWidth:u,curbHeight:d,railingHeight:f,postSpacing:m,pierSpacing:h}=to,g=[],_=[],v=[],y=[],b=[],x=[],S=(e,t)=>{let n=g.length/3;for(let t of e)g.push(t.x,t.y,t.z);t.push(n,n+1,n+2,n,n+2,n+3)},C=e=>{let t=new Y;t.setAttribute(`position`,new p(e.flatMap(e=>[e.x,e.y,e.z]),3)),t.setIndex([0,1,2,0,2,3]);let n=r(t,-.015);try{let e=n.getAttribute(`position`),t=n.getIndex(),r=g.length/3;for(let t=0;t<e.count;t++)g.push(e.getX(t),e.getY(t),e.getZ(t));for(let n=0;n<(t?.count??e.count);n++)v.push(r+(t?t.getX(n):n))}finally{t.dispose(),n.dispose()}},w=e=>{let n=o.getPointAt(e),r=o.getTangentAt(e),i=new I(r.z,0,-r.x).normalize();return{point(e,r){let a=n.clone().addScaledVector(i,e);return a.y=t(a.x,a.z)+r,a}}},T=(e,t)=>{let n=t.clone().sub(e).normalize(),r=Math.abs(n.y)>.9?new I(1,0,0):new I(0,1,0),i=new I().crossVectors(n,r).normalize().multiplyScalar(to.trussBeamWidth/2),a=new I().crossVectors(n,i).normalize().multiplyScalar(to.trussBeamWidth/2),o=e=>[e.clone().add(i).add(a),e.clone().sub(i).add(a),e.clone().sub(i).sub(a),e.clone().add(i).sub(a)],s=o(e),c=o(t);S([...s].reverse(),x),S(c,x);for(let e=0;e<4;e++)S([s[e],s[(e+1)%4],c[(e+1)%4],c[e]],x)},E=(e,t,n,r,i,a,o,c=!1)=>{let l=Math.max(1,Math.ceil((t-e)*s/1.5)),u;for(let s=0;s<=l;s++){let{point:d}=w(L.lerp(e,t,s/l)),f=[d(n,i),d(r,i),d(r,a),d(n,a)];if(!u)S([...f].reverse(),c?v:o);else for(let e=0;e<4;e++){let t=(e+1)%4,n=[u[e],u[t],f[t],f[e]];c&&e===2?C(n):S(n,o)}s===l&&S(f,c?v:o),u=f}};for(let{start:e,end:t}of a){if(!Number.isFinite(e)||!Number.isFinite(t)||e<0||t>1||t<=e)throw Error(`Invalid bridge span`);let r=(t-e)*s,a=w((e+t)/2).point(0,-l),o=r>=to.trussMinLength&&a.y-n(a.x,a.z)>=to.trussMinClearance,p=Math.max(1,Math.ceil(r/(o?to.trussPierSpacing:h)));if(i.parts!==`substructure`){E(e,t,-c-u,c+u,-l,-.015,_,!0);for(let n of[-1,1]){let i=n*(c+u/2);E(e,t,i-u/2,i+u/2,-.03,d,_),E(e,t,i-.07,i+.07,d,f+.07,b);for(let n of[.8,f])E(e,t,i-.065,i+.065,n-.07,n+.07,y);let a=Math.max(1,Math.ceil(r/m));for(let n=0;n<=a;n++){let r=L.lerp(e,t,n/a),o=Math.min(.08/s,(t-e)/4);E(Math.max(e,r-o),Math.min(t,r+o),i-.07,i+.07,d,f,y)}}}if(i.parts!==`deck`){if(o){let i=Math.ceil(r/p/to.trussPanelLength),a=p*i,o;for(let s=0;s<=a;s++){let{point:u}=w(L.lerp(e,t,s/a)),d=[-1,1].map(e=>u(e*c,-l-.2)),f=Math.min(...d.map(e=>e.y-n(e.x,e.z))),p=.6+.4*(2*(s%i/i)-1)**2,m=Math.max(.5,Math.min(Math.min(to.trussMaxDepth,r*.055)*p,f-2)),h=d.map(e=>e.clone().add(new I(0,-m,0))),g=[...d,...h];T(h[0],h[1]);for(let e=0;e<2;e++)T(d[e],h[e]),o&&(T(o[e],d[e]),T(o[e+2],h[e]),T(s%2?o[e]:o[e+2],s%2?h[e]:d[e]));o&&T(o[2],h[1]),o=g}}for(let r=1;r<p;r++){let a=L.lerp(e,t,r/p),{point:u}=w(a),d=i.allowPier;if(!d||[-1,0,1].every(e=>{let t=u(e*c,0);return d(t.x,t.z)})){for(let e of[-1,1]){let t=e*c*.65,r=u(t,-l),i=r.y-n(r.x,r.z);if(i<2)continue;let d=o?L.clamp(i*.025,.65,2.5):.65,f=1/0;for(let e of[-1,0,1]){let r=w(a+e*d/s);for(let e of[-1,0,1]){let i=r.point(t+e*d,0);f=Math.min(f,n(i.x,i.z)-i.y)}}f-=to.pierEmbedDepth,E(a-d/s,a+d/s,t-d,t+d,f,-l,_)}E(a-.9/s,a+.9/s,-c,c,-l-.65,-l,_)}}}}return{positions:new Float32Array(g),indices:new Uint32Array([..._,...y,...x,...v]),collisionIndices:new Uint32Array([..._,...b,...x,...v]),concreteCount:_.length,deckSurfaceCount:v.length,trussCount:x.length}}function ro(e,t={}){let n=new r;n.name=`bridges`;for(let[r,i,a,o]of[[`bridge-concrete`,e.indices.subarray(0,e.concreteCount),t.concrete??10722961,0],[`bridge-railings`,e.indices.subarray(e.concreteCount,e.indices.length-e.deckSurfaceCount-e.trussCount),t.steel??7766922,.65],[`bridge-trusses`,e.indices.subarray(e.indices.length-e.deckSurfaceCount-e.trussCount,e.indices.length-e.deckSurfaceCount),t.steel??5401945,.65]]){if(!i.length)continue;let t=new Y;t.setAttribute(`position`,new G(e.positions,3)),t.setIndex(new G(i,1)),t.computeVertexNormals();let s=new u({color:a,roughness:o?.45:.9,metalness:o,side:2,shadowSide:1}),c=new z(t,s);c.name=r,c.castShadow=!0,c.receiveShadow=!0,n.add(c)}return n}var io=.5;function ao(e,t){return(e.structures?.filter(({type:e})=>e===`tunnel`)??[]).map(({start:e,end:n})=>{if(!Number.isFinite(e)||!Number.isFinite(n)||e<0||n>1||n<=e)throw Error(`Invalid tunnel span`);return{start:Math.max(0,e-20/t),end:Math.min(1,n+20/t)}})}function oo(e,t){if(!e.structures?.filter(({type:e})=>e===`tunnel`)?.length||e.flat)return[];let n=Ji({...e,reverse:!1}),r=n.getLength(),i=e.width/2+(e.shoulderWidth??1.6)+io,a=[];for(let{start:o,end:s}of ao(e,r)){let e=Math.max(1,Math.ceil((s-o)*r/2)),c=[];for(let r=0;r<=e;r++){let a=L.lerp(o,s,r/e),l=n.getPointAt(a),u=n.getTangentAt(a),d=new I(u.z,0,-u.x).normalize(),f=t(l.x,l.z),p=[];for(let e=0;e<=18;e++){let n=Math.PI*Math.max(0,Math.min(16,e-1))/16,r=-i*Math.cos(n),a=l.clone().addScaledVector(d,r);a.y=e===0||e===18?t(a.x,a.z)-.15:f+3+Math.sin(n)*3.5,p.push(a)}c.push(p)}let l=[];for(let e=1;e<c.length;e++){let t=c[e-1],n=c[e],r=t[1].clone().add(t.at(-2)).add(n[1]).add(n.at(-2)).multiplyScalar(.25),i=[],a=(e,t,n)=>{let a=new M().setFromCoplanarPoints(e,t,n);return a.distanceToPoint(r)>0&&a.negate(),i.push(a),a};a(t[0],t[1],t.at(-1)),a(n[0],n.at(-1),n[1]);for(let e=0;e<t.length-1;e++)a(t[e],n[e],t[e+1]).constant+=.04;l.push(i)}a.push({rings:c,planes:l})}return a}function so(e,t){let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=e[(i+1)%e.length],s=t(a),c=t(o);if((s<=0?n:r).push(a),s<0&&c>0||s>0&&c<0){let e=s/(s-c),t=a.map((t,n)=>L.lerp(t,o[n],e));n.push(t),r.push(t)}}return{inside:n,outside:r}}function co(e,t){let n=new ye,r=[];for(let i=0;i<t.length;i+=3)n.a.fromArray(e,t[i]*3),n.b.fromArray(e,t[i+1]*3),n.c.fromArray(e,t[i+2]*3),n.getArea()>1e-6&&r.push(t[i],t[i+1],t[i+2]);return r}function lo(e,t,n){let r=oo(t,n);if(!r.length)return e;let i=new Map;for(let{rings:e,planes:t}of r)for(let n=0;n<t.length;n++){let r=new Ne().setFromPoints([...e[n],...e[n+1]]);for(let e=Math.floor(r.min.x/16);e<=Math.floor(r.max.x/16);e++)for(let a=Math.floor(r.min.z/16);a<=Math.floor(r.max.z/16);a++){let r=`${e},${a}`,o=i.get(r)??[];o.push(t[n]),i.set(r,o)}}let a=Object.entries(e.attributes),o=e.getAttribute(`position`),s=e.getIndex(),c=a.map(()=>[]),l=[],u=new Map,d=new I,f=e=>{if(e.length<3)return;let t=c[0].length/a[0][1].itemSize;for(let t of e){let e=0;a.forEach(([,n],r)=>{c[r].push(...t.slice(e,e+n.itemSize)),e+=n.itemSize})}for(let n=1;n<e.length-1;n++)l.push(t,t+n,t+n+1)},m=e=>a.flatMap(([,t])=>Array.from({length:t.itemSize},(n,r)=>t.getComponent(e,r))),h=a.slice(0,a.findIndex(([e])=>e===`position`)).reduce((e,[,t])=>e+t.itemSize,0);for(let e=0;e<(s?.count??o.count);e+=3){let t=[0,1,2].map(t=>s?s.getX(e+t):e+t),n=new Ne().setFromPoints(t.map(e=>new I().fromBufferAttribute(o,e))),r=new Set;for(let e=Math.floor(n.min.x/16);e<=Math.floor(n.max.x/16);e++)for(let t=Math.floor(n.min.z/16);t<=Math.floor(n.max.z/16);t++)for(let n of i.get(`${e},${t}`)??[])r.add(n);if(!r.size){for(let e of t){let t=u.get(e);if(t===void 0){t=c[0].length/a[0][1].itemSize;let n=m(e),r=0;a.forEach(([,e],t)=>{c[t].push(...n.slice(r,r+e.itemSize)),r+=e.itemSize}),u.set(e,t)}l.push(t)}continue}let p=[t.map(m)];for(let e of r){let t=[];for(let n of p){if(e.some(e=>n.every(t=>e.distanceToPoint(d.fromArray(t,h))>=0))){t.push(n);continue}let r=n;for(let n of e){if(r.length<3)break;let e=so(r,e=>n.distanceToPoint(d.fromArray(e,h)));e.outside.length>=3&&t.push(e.outside),r=e.inside}}p=t}for(let e of p)f(e)}let g=new Y;return a.forEach(([e,t],n)=>g.setAttribute(e,new p(c[n],t.itemSize))),g.setIndex(co(g.getAttribute(`position`).array,l)),g}function uo(e,t,n,r){let i=oo(e,t);if(!i.length)return;let a=[],o=[],s=[],c=[],l=(e,t,r)=>{let i=e.map(e=>e.toArray());if(r&&n&&(i=so(i,e=>e[1]-n(e[0],e[2])+.02).inside),i.length<3)return;let o=t===s?c:a,l=o.length/3;for(let e of i)o.push(...e);for(let e=1;e<i.length-1;e++)t.push(l,l+e,l+e+1)};for(let{rings:e}of i)for(let n=1;n<e.length;n++){let r=e[n-1],i=e[n];for(let e=0;e<r.length-1;e++)l([r[e],r[e+1],i[e]],o,!0),l([i[e],r[e+1],i[e+1]],o,!0);let a=[r[0],i[0],r.at(-1),i.at(-1)].map(e=>new I(e.x,t(e.x,e.z),e.z));l([a[0],a[1],a[2]],s,!1),l([a[2],a[1],a[3]],s,!1)}let u=new Y;u.setAttribute(`position`,new p(c,3)),u.setIndex(s);let d=r?r(u):u,f=d.getAttribute(`position`),m=d.getIndex(),h=a.length/3;for(let e=0;e<f.count;e++)a.push(f.getX(e),f.getY(e),f.getZ(e));let g=Array.from({length:m?.count??f.count},(e,t)=>h+(m?m.getX(t):t));d!==u&&d.dispose(),u.dispose();let _=new Float32Array(a),v=co(_,o);return{positions:_,indices:new Uint32Array([...v,...co(_,g)]),collisionIndices:new Uint32Array(v),liningCount:v.length}}function fo(e,t={},n){let i=new r;i.name=`tunnels`;for(let[r,a,o]of[[`tunnel-lining`,e.indices.subarray(0,e.liningCount),t.lining??7828846],[`tunnel-floor`,e.indices.subarray(e.liningCount),t.ground??6708035]]){let t=new Y;t.setAttribute(`position`,new G(e.positions,3)),t.setIndex(new G(a,1));let s=r===`tunnel-floor`&&n?n:new u({color:o,roughness:.95,side:2});if(r===`tunnel-floor`&&n){let n=e.positions.length/3,r=new Float32Array(n*2);for(let t=0;t<n;t++)r.set([e.positions[t*3]/6,e.positions[t*3+2]/6],t*2);t.setAttribute(`uv`,new G(r,2)),t.setAttribute(`color`,new G(new Float32Array(n*3).fill(1),3)),t.setAttribute(`vegetation`,new G(new Float32Array(n*2),2)),t.setAttribute(`sceneryRoad`,new G(new Float32Array(n).fill(1e3),1))}let c=t;t=mi(c),c.dispose(),t.computeVertexNormals();let l=new z(t,s);l.name=r,l.castShadow=!0,l.receiveShadow=!0,i.add(l)}return i}var po=class{spacing;columns;rows;minX;minZ;heights;mesh;grass;sceneryRoadsVisible={value:1};minHeight;maxHeight;flippedCells;warpedCells;warpedVertices;filletVertices;filletCells;collisionMesh;bridgeMesh;groundSurface;segments;surface;halfWidth;asphaltSpans;padRadius;groundQuery;groundTriangles;exteriorQuery;riverChannels;groundMeshes=[];constructor(e,t=!0){let n=e.scenery?.bounds;this.spacing=n?5:1.5,this.halfWidth=e.width/2+(e.shoulderWidth??1.6),this.padRadius=e.padRadius;let r=Ji({...e,reverse:!1}),i=r.getLength(),a=Math.ceil(i),o=t=>e.closed===!1?L.clamp(t,0,1):L.euclideanModulo(t,1);if(this.segments=Array.from({length:a},(t,n)=>{let s=n/a,c=r.getPointAt(s),l=r.getPointAt((n+1)/a),u=r.getTangentAt(o(s-5/i)),d=r.getTangentAt(e.closed===!1?o(s+5/i):(s+5/i)%1),f=Math.atan2(u.z*d.x-u.x*d.z,u.dot(d));return{a:c,b:l,bank:-L.clamp(f/10*2.5,-.065,.065)}}),e.elevation||e.bankingScale!==void 0){let t=!e.elevation&&e.bankingScale!==void 0,n=Math.max(1,Math.round((t?75:25)/(i/a))),r=Array.from({length:n*2+1},(e,r)=>t?(1-((r-n)/n)**2)**3:n+1-Math.abs(r-n)),o=this.segments.map(({bank:e})=>e);this.segments.forEach((t,i)=>{let s=0,c=0;for(let t=-n;t<=n;t++){let l=r[t+n],u=e.closed===!1?L.clamp(i+t,0,a-1):L.euclideanModulo(i+t,a);s+=o[u]*l,c+=l}t.bank=s/c})}let s=new Ne().setFromPoints(this.segments.map(e=>e.a)),c=e.elevation,l=e.terrain?wi(e.terrain):void 0,d=n!==void 0&&this.padRadius===void 0&&!!l,f=1e3,m=!l&&c&&go(this.segments.map(({a:t},n)=>({x:t.x,z:t.z,height:Ki(c,n/a,e.closed!==!1)})));this.padRadius!==void 0&&(s.expandByPoint(new I(-this.padRadius,0,-this.padRadius)),s.expandByPoint(new I(this.padRadius,0,this.padRadius)));let h=Math.min(s.min.x-200,n?n.minX-200:1/0),g=Math.min(s.min.z-200,n?n.minZ-200:1/0),v=Math.max(s.max.x+200,n?n.maxX+200:-1/0),y=Math.max(s.max.z+200,n?n.maxZ+200:-1/0);this.minX=Math.floor(h/this.spacing)*this.spacing,this.minZ=Math.floor(g/this.spacing)*this.spacing,this.columns=Math.ceil((v-this.minX)/this.spacing)+1,this.rows=Math.ceil((y-this.minZ)/this.spacing)+1;let b=e.structures?.filter(({type:e})=>e===`tunnel`)??[];this.asphaltSpans=d?ao(e,i):void 0,this.surface=new wa(this.segments,this.halfWidth,this.padRadius,this.asphaltSpans),this.heights=new Float32Array(this.columns*this.rows);let x=new Float32Array(this.heights.length*3),S=e.elevationScale??1,C=e.bankingScale??S,w=new Float32Array(this.heights.length*2),T=[],E=new Float32Array(this.heights.length),D=new Float32Array(this.heights.length),O=l?this.spacing*Math.SQRT2:0,A=l?this.halfWidth+O:Math.min(this.halfWidth+3,48),ee=this.halfWidth,j=Math.min(this.halfWidth+48,50),M=e.terrainTransition??8,te=e.structures?.filter(({type:e})=>e===`bridge`)??[],N=[...b,...te],ne=this.halfWidth+Math.max(io,to.edgeWidth)+O,re=e=>{if(!d||!b.length)return 0;let t=this.halfWidth+io+O,n=1-L.smoothstep(e.distance,t,t+O);return n?b.reduce((t,{start:r,end:a})=>Math.max(t,n*(1-L.smoothstep(Math.max(r-e.fraction,e.fraction-a)*i,O,O+20))),0):0},P=(t,n,r,a)=>{let o=d?re(r):1;if(!o)return(l?.(t,n,r.distance)??0)*S;if(N.length&&r.distance<(l?ne+M:j))for(let{start:e,end:t}of N){let n=Math.max(e-r.fraction,r.fraction-t,0)*i;a=L.lerp(a,Math.max(a,ne),1-L.smoothstep(n,0,10))}let s=Ci(t,n),u=12+9*Math.sin(t/48+.6)*Math.cos(n/61)+5*Math.sin((t-n)/83),f=(c?Ki(c,r.fraction,e.closed!==!1):Ci(r.x,r.z))*S+r.bank*r.across*C,p=l?l(t,n,r.distance):m?m(t,n)+.35*(u-12):s+u,h=p*S-f,g=l?a+Math.min(M,Math.max(Math.abs(h),3)):j,_=e.flat?0:f+h*L.smoothstep(r.distance,a,g);return d?L.lerp(p*S,_,o):_},ie=e.scenery?.roads.length&&!e.flat?new qa(e.scenery.roads,(e,t)=>d?l(e,t)*S:P(e,t,this.nearest(e,t),A)):void 0;if(ie)for(let e of this.segments)e.bank*=ie.bankingWeight(e.a.x,e.a.z);let F=(e,t,n,r)=>{let i=P(e,t,n,r);if(!ie)return i;let a=L.smoothstep(n.distance,this.halfWidth+7,this.halfWidth+20),o=d?1-re(n):a;return L.lerp(i,ie.heightAt(e,t,i),o)},ae=e.scenery?.waterways.length?new $a(e.scenery.waterways,(e,t)=>F(e,t,this.nearest(e,t),A)):void 0;this.riverChannels=ae;let se=(e,t,n,r)=>{let i=F(e,t,n,r);if(!ae)return i;let a=Math.min(ie?.pavementDistance(e,t)??1/0,d?1/0:n.distance-this.halfWidth);return ae.heightAt(e,t,i,a)},ce=(e,t,n,r=this.nearest(t,n),i=A)=>{E[e]=d&&!re(r)?f:this.padRadius===void 0?r.distance-this.halfWidth:Math.hypot(t,n)-this.padRadius,this.heights[e]=se(t,n,r,i),D[e]=L.smoothstep(r.distance,this.halfWidth+3,this.halfWidth+18),x.set([t,this.heights[e],n],e*3),w.set([t/6,n/6],e*2)},le=e=>ce(e,this.minX+e%this.columns*this.spacing,this.minZ+Math.floor(e/this.columns)*this.spacing),R=l&&!e.flat&&this.padRadius===void 0&&!d?new Map:void 0,ue=Math.ceil(M/this.spacing);for(let e=0;e<this.heights.length;e++){let t=this.minX+e%this.columns*this.spacing,n=this.minZ+Math.floor(e/this.columns)*this.spacing,r=this.nearest(t,n),i=Math.round((r.distance-ee)/this.spacing);if(!R||i<0||i>ue){ce(e,t,n,r);continue}let a=(ee+i*this.spacing)/r.distance,o={x:r.x+(t-r.x)*a,z:r.z+(n-r.z)*a};R.set(e,o),ce(e,o.x,o.z,void 0,ee)}for(let e=!0;R&&e;){e=!1;for(let t of R.keys()){let n=t%this.columns,r=Math.floor(t/this.columns);for(let t=Math.max(r-1,0);t<=Math.min(r,this.rows-2);t++)for(let r=Math.max(n-1,0);r<=Math.min(n,this.columns-2);r++){let n=t*this.columns+r,i=[n,n+1,n+this.columns,n+this.columns+1],a=yo(x,...i),o=bo(E,...i);if(!a.some((e,t)=>e&&!o[t]))for(let t of i)R.delete(t)&&(le(t),e=!0)}}}let de=new Float32Array(this.heights.length);for(let t=0;t<12&&!l&&!e.flat;t++){de.set(this.heights);for(let e=1;e<this.rows-1;e++)for(let t=1;t<this.columns-1;t++){let n=e*this.columns+t,r=this.heights[n-1]+this.heights[n+1]+this.heights[n-this.columns]+this.heights[n+this.columns];de[n]=L.lerp(this.heights[n],(this.heights[n]*4+r)/8,D[n])}this.heights.set(de)}let fe=(e,t,n)=>{if(!l)return n;let r=this.nearest(e,t),a=b.reduce((e,{start:t,end:n})=>Math.max(e,1-L.smoothstep(Math.max(t-r.fraction,r.fraction-n)*i,0,20)),0),o=ne+M,s=a*(1-L.smoothstep(r.distance,o,o+this.spacing*Math.SQRT2));if(!s)return n;let c=l(e,t,r.distance)*S,u=d&&ie?ie.heightAt(e,t,c):c;return L.lerp(n,u,s)};if(b.length&&l&&!e.flat){let e=this.heights.slice();for(let t=0;t<e.length;t++){let n=x[t*3],r=x[t*3+2];e[t]=fe(n,r,e[t])}this.exteriorQuery={...this,heights:e}}let pe=(e,t,n,r,i)=>{let a=0;for(let o=-1;o<=1;o+=2){let s=t+o*r,c=n+o*i;if(s<0||c<0||s>=this.columns||c>=this.rows)continue;let l=c*this.columns+s,u=Math.hypot(x[l*3]-x[e*3],x[l*3+2]-x[e*3+2]),d=this.exteriorQuery?.heights??this.heights;a=Math.max(a,Math.abs(d[l]-d[e])/u)}return a},B=1/0,me=-1/0;for(let e=0;e<this.heights.length;e++){x[e*3+1]=this.exteriorQuery?.heights[e]??this.heights[e],B=Math.min(B,this.heights[e]),me=Math.max(me,this.heights[e],x[e*3+1]);let t=e%this.columns,n=Math.floor(e/this.columns),r=Math.atan(Math.max(Math.hypot(pe(e,t,n,1,0),pe(e,t,n,0,1)),Math.hypot(pe(e,t,n,1,1),pe(e,t,n,1,-1))));T.push(x[e*3+1]>this.heights[e]+1?f:E[e],r)}if(R?.size){this.warpedVertices=R,this.warpedCells=new Uint8Array((this.columns-1)*(this.rows-1));for(let e of R.keys()){let t=e%this.columns,n=Math.floor(e/this.columns);for(let e=Math.max(n-1,0);e<=Math.min(n,this.rows-2);e++)for(let n=Math.max(t-1,0);n<=Math.min(t,this.columns-2);n++)this.warpedCells[e*(this.columns-1)+n]=1}}l&&!e.flat&&!d&&(this.flippedCells=xo(this.heights,E,this.columns,this.rows,x));let he=[];if(this.warpedCells){let e=this.heights.length,t=t=>t<e?{x:x[t*3],z:x[t*3+2]}:{x:he[(t-e)*3],z:he[(t-e)*3+2]},n=e=>R.has(e)?Math.round(E[e]/this.spacing):NaN,r=(t,r)=>n(t)<n(r)?t*e+r:r*e+t,i=[],a=new Set;for(let e=0;e<this.rows-1;e++)for(let t=0;t<this.columns-1;t++){let o=e*(this.columns-1)+t;if(!this.warpedCells[o])continue;let s=Aa(this,t,e);for(let e=0;e<s.length;e+=3){let t=s.slice(e,e+3),c=t.map(n),l=Math.min(...c),u=Math.max(...c)-l===1;for(let[e,n]of[[0,1],[1,2],[2,0]])!u&&Math.abs(c[e]-c[n])===1&&a.add(r(t[e],t[n]));if(!u){i.push({cell:o,corners:t});continue}let d=c.findIndex(e=>c.filter(t=>t===e).length===1),f=t.filter((e,t)=>t!==d),p=t[d],m=c[d]===l?f.map(e=>[p,e]):f.map(e=>[e,p]);i.push({cell:o,crossings:m,corners:t})}}let o=new Map,s=([t,n])=>{let i=r(t,n);if(a.has(i))return[t,n];let s=o.get(i);if(s)return s;s=[t];for(let r=1;r<vo;r++){let i=r/vo,a=L.lerp(x[t*3],x[n*3],i),o=L.lerp(x[t*3+2],x[n*3+2],i),c=this.nearest(a,o);s.push(e+he.length/3),he.push(a,se(a,o,c,ee),o);let l=L.lerp(T[t*2+1],T[n*2+1],i);T.push(c.distance-this.halfWidth,l)}return s.push(n),o.set(i,s),s},c=new Map;for(let{cell:e,crossings:n,corners:r}of i){let i=c.get(e)??[];if(c.set(e,i),!n){i.push(...r);continue}let[a,o]=n.map(e=>e[0]===n[0][0]&&e[0]===n[1][0]?[...s(e)].reverse():s(e)),l=(e,n,r)=>{if(e===n||n===r||r===e)return;let[a,o,s]=[t(e),t(n),t(r)],c=(o.x-a.x)*(s.z-a.z)-(s.x-a.x)*(o.z-a.z)<0;i.push(...c?[e,n,r]:[e,r,n])};for(let e=0,t=0;e<a.length-1||t<o.length-1;)t===o.length-1||e<a.length-1&&(e+1)/(a.length-1)<=(t+1)/(o.length-1)?l(a[e],a[++e],o[t]):l(a[e],o[t],o[++t])}he.length&&(this.filletVertices=new Float32Array(he),this.filletCells=new Map([...c].filter(([,e])=>e.length>6)))}if(d&&(ie||ae)){let e=new Set,t=this.columns-1;for(let n=0;n<this.rows-1;n++)for(let r=0;r<t;r++){let i=this.minX+(r+.5)*this.spacing,a=this.minZ+(n+.5)*this.spacing;if(!((ie?.pavementDistance(i,a)??1/0)>20+this.spacing*Math.SQRT2&&!ae?.near(i,a,this.spacing*Math.SQRT2)))for(let[i,a]of[[.5,.5],[.25,.25],[.75,.75],[.25,.75],[.75,.25]]){let o=this.minX+(r+i)*this.spacing,s=this.minZ+(n+a)*this.spacing;if(!(Math.abs(se(o,s,this.nearest(o,s),A)-this.heightAt(o,s))<=.1)){e.add(n*t+r);break}}}let n=new Map,r=new Map,i=this.heights.length,a=(e,t)=>{if(e%4==0&&t%4==0)return t/4*this.columns+e/4;let n=`${e},${t}`,a=r.get(n);if(a!==void 0)return a;let o=this.minX+e/4*this.spacing,s=this.minZ+t/4*this.spacing,c=this.nearest(o,s);a=i+he.length/3,r.set(n,a),he.push(o,se(o,s,c,A),s);let l=Math.floor(t/4)*this.columns+Math.floor(e/4);return T.push(c.distance-this.halfWidth,T[l*2+1]),a},o=new Set(e);for(let n of e){let e=n%t,r=Math.floor(n/t);for(let[n,i]of[[-1,0],[1,0],[0,-1],[0,1]])e+n>=0&&e+n<t&&r+i>=0&&r+i<this.rows-1&&o.add((r+i)*t+e+n)}for(let r of o){let i=r%t,o=Math.floor(r/t),s=[];if(e.has(r))for(let e=0;e<4;e++)for(let t=0;t<4;t++){let n=a(i*4+t,o*4+e),r=a(i*4+t+1,o*4+e),c=a(i*4+t,o*4+e+1),l=a(i*4+t+1,o*4+e+1);s.push(n,c,r,r,c,l)}else{let n=[];for(let[s,c,l,u,d]of[[0,0,0,4,i>0?r-1:-1],[0,4,4,4,o<this.rows-2?r+t:-1],[4,4,4,0,i<t-1?r+1:-1],[4,0,0,0,o>0?r-t:-1]]){let t=e.has(d)?4:1;for(let e=0;e<t;e++)n.push(a(i*4+s+(l-s)*e/t,o*4+c+(u-c)*e/t))}let c=a(i*4+2,o*4+2);for(let e=0;e<n.length;e++)s.push(c,n[e],n[(e+1)%n.length])}n.set(r,s)}he.length&&(this.filletVertices=new Float32Array(he),this.filletCells=n)}if(te.length&&l&&!e.flat&&!d){let e=(e,t,n)=>{let r=this.nearest(e,t),a=1-L.smoothstep(r.distance,ne+M,ne+M+10);if(a<=0)return n;let o=0;for(let{start:e,end:t}of te){if(r.fraction<=e||r.fraction>=t)continue;let n=Math.min(r.fraction-e,t-r.fraction)*i;o=Math.max(o,L.smoothstep(n,0,8)*a)}return o>0?L.lerp(n,Math.min(n,l(e,t,r.distance)*S),o):n},t=this.heights.slice();for(let n=0;n<t.length;n++)t[n]=e(x[n*3],x[n*3+2],t[n]),B=Math.min(B,t[n]);let n=this.filletVertices?.slice();if(n)for(let t=0;t<n.length;t+=3)n[t+1]=e(n[t],n[t+2],n[t+1]),B=Math.min(B,n[t+1]);this.groundSurface={heights:t,filletVertices:n}}if(this.minHeight=B===me?B-.01:B,this.maxHeight=B===me?me+.01:me,this.groundSurface&&(this.groundQuery={...this,...this.groundSurface}),this.exteriorQuery){let e=this.groundSurface?this.groundSurface.heights.map((e,t)=>fe(x[t*3],x[t*3+2],e)):this.exteriorQuery.heights,t=(this.groundSurface?.filletVertices??this.filletVertices)?.slice();if(t)for(let e=0;e<t.length;e+=3)t[e+1]=fe(t[e],t[e+2],t[e+1]);this.exteriorQuery={...this,heights:e,filletVertices:t}}let ge=d?{...e,structures:b}:e;if(this.collisionMesh=uo(ge,(e,t)=>Ta(this,e,t),this.exteriorQuery?(e,t)=>this.exteriorHeightAt(e,t):void 0,e=>this.projectGeometry(e,0)),this.bridgeMesh=no(ge,(e,t)=>Ta(this,e,t),(e,t)=>this.groundHeightAt(e,t),(e,t)=>this.projectGeometry(e,t)),!t&&!this.exteriorQuery){this.mesh=new z(new Y,new u),this.grass=new _(new Y,new u,0);return}let V=R?.size||this.filletCells?.size?E.slice():E;for(let e of R?.keys()??[])V[e]=0;for(let e of this.filletCells?.keys()??[]){let t=Math.floor(e/(this.columns-1))*this.columns+e%(this.columns-1);for(let e of[0,1,this.columns,this.columns+1])V[t+e]=0}let H=eo(this.columns,this.rows,V,this.spacing,(e,t)=>Aa(this,e,t),e.scenery&&{minX:this.minX,minZ:this.minZ,lines:[...e.scenery.roads,...e.scenery.waterways]}),_e=new Float32Array(x.length+he.length);if(_e.set(x),_e.set(he,x.length),this.groundSurface){for(let e=0;e<this.heights.length;e++)_e[e*3+1]=this.groundSurface.heights[e];this.groundSurface.filletVertices&&_e.set(this.groundSurface.filletVertices,x.length)}if(this.exteriorQuery){for(let e=0;e<this.heights.length;e++)_e[e*3+1]=this.exteriorQuery.heights[e];this.exteriorQuery.filletVertices&&_e.set(this.exteriorQuery.filletVertices,x.length)}let ve=new Float32Array(_e.length/3*2);ve.set(w);for(let e=0;e<he.length;e+=3)ve.set([he[e]/6,he[e+2]/6],w.length+e/3*2);let W=new Y;if(W.setAttribute(`position`,new G(_e,3)),W.setAttribute(`uv`,new G(ve,2)),W.setAttribute(`color`,new G(new Float32Array(_e.length).fill(1),3)),W.setAttribute(`vegetation`,new p(T,2)),W.setAttribute(`sceneryRoad`,new G(new Float32Array(_e.length/3).fill(f),1)),W.setIndex(new G(H,1)),W.computeVertexNormals(),this.exteriorQuery){let t=W;if(W=lo(t,e,(e,t)=>this.heightAt(e,t)),t.dispose(),this.collisionMesh){let e=W.getAttribute(`position`),t=W.getIndex(),n=[];for(let r=0;r<t.count;r+=3){let i=[0,1,2].map(e=>t.getX(r+e));if(i.some(t=>e.getY(t)>this.heightAt(e.getX(t),e.getZ(t))+.05))for(let t of i)n.push(e.getX(t),e.getY(t),e.getZ(t))}let r=this.collisionMesh,i=new Float32Array(r.positions.length+n.length);i.set(r.positions),i.set(n,r.positions.length);let a=new Uint32Array(r.collisionIndices.length+n.length/3);a.set(r.collisionIndices);for(let e=0;e<n.length/3;e++)a[r.collisionIndices.length+e]=r.positions.length/3+e;this.collisionMesh={...r,positions:i,collisionIndices:a}}}if(!t){this.mesh=new z(W,new u),this.grass=new _(new Y,new u,0);return}let ye=ba(`rock`),be=ba(`gravel`),xe=be.map,Se=be.normalMap,Ce=be.roughnessMap;be.dispose();let we=ba(`grass`),Te=we.map,Ee=we.normalMap,De=we.roughnessMap;we.dispose(),ye.onBeforeCompile=e=>{e.uniforms.grassMap={value:Te},e.uniforms.grassNormalMap={value:Ee},e.uniforms.grassRoughnessMap={value:De??Te},e.uniforms.soilMap={value:xe},e.uniforms.soilNormalMap={value:Se},e.uniforms.soilRoughnessMap={value:Ce??xe},e.uniforms.sceneryRoadsVisible=this.sceneryRoadsVisible,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec2 vegetation;
attribute float sceneryRoad;
uniform float sceneryRoadsVisible;
varying vec2 vVegetation;
varying vec3 vTerrainPosition;
varying vec3 vTerrainNormal;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
          vVegetation = vec2(
            min(vegetation.x, mix(${f.toFixed(1)}, sceneryRoad, sceneryRoadsVisible)),
            vegetation.y
          );
          vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
        uniform sampler2D grassMap;
        uniform sampler2D grassNormalMap;
        uniform sampler2D grassRoughnessMap;
        uniform sampler2D soilMap;
        uniform sampler2D soilNormalMap;
        uniform sampler2D soilRoughnessMap;
        varying vec2 vVegetation;
        varying vec3 vTerrainPosition;
        varying vec3 vTerrainNormal;
        ${ga}
        vec4 terrainSample(sampler2D tex, vec2 uv) {
          float blend = smoothstep(0.2, 0.8, terrainNoise(uv * 0.23));
          return mix(texture2D(tex, uv), texture2D(tex, uv + vec2(0.37, 0.61)), blend);
        }
        // Distant ground mixes in a rotated, non-integer-scale copy so 3 m tiles don't line up
        // into stripes across hillsides.
        float terrainFar() {
          return smoothstep(12.0, 70.0, length(vViewPosition));
        }
        vec4 groundSample(sampler2D tex, vec2 uv) {
          vec2 macro = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.29 + vec2(0.13, 0.71);
          return mix(terrainSample(tex, uv), terrainSample(tex, macro), terrainFar() * 0.6);
        }
        vec4 triplanarSample(sampler2D tex, vec3 position, vec3 weights) {
          return terrainSample(tex, position.zy) * weights.x +
            terrainSample(tex, position.xz) * weights.y +
            terrainSample(tex, position.xy) * weights.z;
        }`).replace(`#include <normalmap_pars_fragment>`,`#include <normalmap_pars_fragment>
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 triplanarNormal(sampler2D tex, vec3 position, vec3 weights, vec3 surface) {
              vec3 nx = terrainSample(tex, position.zy).xyz * 2.0 - 1.0;
              vec3 ny = terrainSample(tex, position.xz).xyz * 2.0 - 1.0;
              vec3 nz = terrainSample(tex, position.xy).xyz * 2.0 - 1.0;
              nx.xy *= normalScale;
              ny.xy *= normalScale;
              nz.xy *= normalScale;
              return (getTangentFrame(-vViewPosition, surface, position.zy) * nx) * weights.x +
                (getTangentFrame(-vViewPosition, surface, position.xz) * ny) * weights.y +
                (getTangentFrame(-vViewPosition, surface, position.xy) * nz) * weights.z;
            }
          #endif`).replace(`#include <map_fragment>`,`
          #ifdef USE_MAP
            vec3 rockWeights = pow(abs(normalize(vTerrainNormal)), vec3(4.0));
            rockWeights /= max(dot(rockWeights, vec3(1.0)), 0.0001);
            vec3 rockPosition = vTerrainPosition / 3.0;
            float patches = terrainNoise(vMapUv * 0.45);
            float detail = terrainNoise(vMapUv * 6.0);
            // Per-fragment slope follows the smoothly interpolated normal across wall fillets,
            // and fine noise keeps slope-driven blends from tracing lines along the road.
            float surfaceSlope = acos(clamp(normalize(vTerrainNormal).y, 0.0, 1.0)) +
              (detail - 0.5) * 0.3 + (patches - 0.5) * 0.2;
            // Top-down UVs stretch into vertical streaks on cut walls; project soil there too.
            float wall = smoothstep(0.3, 0.75, surfaceSlope);
            vec4 gravelColor = triplanarSample(map, rockPosition, rockWeights);
            vec4 grassColor = groundSample(grassMap, vMapUv * 2.0);
            vec4 soilColor = groundSample(soilMap, vMapUv * 2.0);
            if (wall > 0.0)
              soilColor = mix(soilColor, triplanarSample(soilMap, rockPosition, rockWeights), wall);
            vec3 dirtColor = roadDirt(soilColor.rgb);
            soilColor.rgb = dirtColor;
            // Recolor the gray scan as weathered tan cut-bank material, keeping its detail.
            float rockLuma = dot(gravelColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            gravelColor.rgb = vec3(0.62, 0.5, 0.37) * rockLuma * 2.4;
            float rockCoverage = smoothstep(0.45, 1.05, surfaceSlope + (patches - 0.5) * 0.15) * 0.75;
            gravelColor = mix(soilColor, gravelColor, rockCoverage);
            vec2 landscapeUV = vTerrainPosition.xz * 0.012;
            float landscape = terrainNoise(landscapeUV) * 0.65 +
              terrainNoise(landscapeUV * 2.7 + vec2(17.3, 9.1)) * 0.35;
            float dryness = smoothstep(0.45, 0.8, landscape + (patches - 0.5) * 0.15);
            float edge = (detail - 0.5) * 0.65 + (patches - 0.5) * 0.8;
            // Packed brown dirt verge along the road, with a ragged edge into grass/rock.
            float verge = 1.0 - smoothstep(2.5, 5.0, vVegetation.x + edge * 1.5);
            gravelColor.rgb = mix(gravelColor.rgb, dirtColor, verge);
            float bankNoise = terrainNoise(vTerrainPosition.xz * 0.09) * 0.6 +
              terrainNoise(vTerrainPosition.xz * 0.31 + vec2(5.2, 1.7)) * 0.4;
            float slopeGrass = 1.0 - smoothstep(0.62, 1.05, vVegetation.y + (bankNoise - 0.5) * 0.45);
            float exposed = smoothstep(0.55, 0.72, landscape + (patches - 0.5) * 0.4);
            float coverage = (1.0 - verge) * slopeGrass * (1.0 - exposed * 0.25);
            float grassLuma = dot(grassColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            grassColor.rgb = mix(vec3(grassLuma), grassColor.rgb, 0.65);
            grassColor.rgb *= mix(vec3(0.78, 0.9, 0.88), vec3(1.0, 0.92, 0.8), dryness);
            gravelColor.rgb *= mix(0.84, 1.04, landscape);
            diffuseColor *= mix(gravelColor, grassColor, coverage);
          #endif
        `).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            float rockRoughness = triplanarSample(roughnessMap, rockPosition, rockWeights).g;
            float groundRoughness = mix(terrainSample(soilRoughnessMap, vMapUv * 2.0).g,
              rockRoughness, rockCoverage);
            roughnessFactor *= mix(groundRoughness,
              terrainSample(grassRoughnessMap, vMapUv * 2.0).g, coverage);
          #endif`).replace(`#include <normal_fragment_maps>`,`#ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 rockNormal = triplanarNormal(normalMap, rockPosition, rockWeights, normal);
            vec3 grassN = terrainSample(grassNormalMap, vNormalMapUv * 2.0).xyz * 2.0 - 1.0;
            vec3 soilN = terrainSample(soilNormalMap, vNormalMapUv * 2.0).xyz * 2.0 - 1.0;
            float detailFade = 1.0 - terrainFar() * 0.85;
            grassN.xy *= normalScale * detailFade;
            soilN.xy *= normalScale * detailFade;
            vec3 soilNormal = tbn * soilN;
            if (wall > 0.0)
              soilNormal = mix(soilNormal,
                triplanarNormal(soilNormalMap, rockPosition, rockWeights, normal), wall);
            vec3 groundNormal = mix(soilNormal, rockNormal, rockCoverage);
            normal = normalize(mix(groundNormal, tbn * grassN, coverage));
          #endif`)},ye.customProgramCacheKey=()=>`scanned-terrain-triplanar`,ye.addEventListener(`dispose`,()=>{Te?.dispose(),Ee?.dispose(),De?.dispose(),xe?.dispose(),Se?.dispose(),Ce?.dispose()}),ye.vertexColors=!0,ye.polygonOffset=!0,ye.polygonOffsetFactor=2,ye.polygonOffsetUnits=2,this.mesh=new z(W,ye);let Oe=new Map,ke=W.getAttribute(`position`),Ae=W.getIndex(),K=new I;for(let e=0;e<Ae.count;e+=3){let t=Ae.getX(e),n=Ae.getX(e+1),r=Ae.getX(e+2),i=(ke.getX(t)+ke.getX(n)+ke.getX(r))/3,a=(ke.getZ(t)+ke.getZ(n)+ke.getZ(r))/3,o=`${Math.floor(i/256)},${Math.floor(a/256)}`,s=Oe.get(o);s||(s={indices:[],bounds:new Ne},Oe.set(o,s)),s.indices.push(t,n,r);for(let e of[t,n,r])s.bounds.expandByPoint(K.fromBufferAttribute(ke,e))}for(let[e,t]of Oe){let n=new Y;for(let[e,t]of Object.entries(W.attributes))n.setAttribute(e,t);n.setIndex(t.indices),n.boundingBox=t.bounds,n.boundingSphere=t.bounds.getBoundingSphere(new oe);let r=new z(n,ye);r.name=`terrain-${e}`,r.receiveShadow=!0,this.groundMeshes.push(r),this.mesh.add(r)}W.setDrawRange(0,0),this.setCastShadow(!0);let je=new Y;je.setAttribute(`position`,new p([-.025,0,0,.025,0,0,.035,.22,.025,0,0,-.025,0,0,.025,-.025,.18,.03],3)),je.computeVertexNormals();let Me=new u({color:16777215,roughness:1,side:2});Me.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_begin>`,Z.lights_fragment_begin.replace(`getSpotLightInfo( spotLight, geometryPosition, directLight );`,`getSpotLightInfo( spotLight, geometryPosition, directLight );
directLight.color *= 0.05;`).replace(`getDirectionalLightInfo( directionalLight, directLight );`,`getDirectionalLightInfo( directionalLight, directLight );
          directLight.color *= mix(0.12, 1.0, smoothstep(0.12, 0.5,
            dot(directionalLight.direction, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)))));`))},Me.customProgramCacheKey=()=>`grass-soft-low-angle-lights`;let Pe=18473,q=()=>{Pe=Pe+1831565813|0;let e=Math.imul(Pe^Pe>>>15,1|Pe);return e^=e+Math.imul(e^e>>>7,61|e),((e^e>>>14)>>>0)/4294967296},Fe=[];for(let e=1;e<this.rows-1;e++)for(let t=1;t<this.columns-1;t++){let n=e*this.columns+t;if(E[n]>3.4&&E[n]<10&&T[n*2+1]<.6&&q()<.44){let n=this.minX+(t+q()-.5)*this.spacing,r=this.minZ+(e+q()-.5)*this.spacing,i=this.padRadius===void 0?this.nearest(n,r).distance-this.halfWidth:Math.hypot(n,r)-this.padRadius;i>3.4&&i<10&&Fe.push({x:n,z:r,blades:3+Math.floor(q()*6)})}}let J=new _(je,Me,Fe.reduce((e,t)=>e+t.blades,0)),Ie=new k,Le=new U,Re=0;Fe.forEach(({x:e,z:t,blades:n})=>{let r=.6+q()*.9;for(let i=0;i<n;i++){let n=q()*Math.PI*2,i=Math.sqrt(q())*.22,a=e+Math.cos(n)*i,o=t+Math.sin(n)*i;Ie.position.set(a,this.groundHeightAt(a,o)-.01,o),Ie.quaternion.setFromUnitVectors(new I(0,1,0),this.normalAt(a,o)),Ie.rotateY(n),Ie.rotateX((q()-.5)*.5),Ie.scale.set(.65+q()*.8,r*(.7+q()*.6),1),Ie.updateMatrix(),J.setMatrixAt(Re,Ie.matrix);let s=q();Le.setRGB(.18+s*.2,.23+s*.18,.09+s*.12),J.setColorAt(Re++,Le)}}),J.receiveShadow=!0,this.mesh.add(J),this.grass=J,this.collisionMesh&&this.mesh.add(fo(this.collisionMesh,{},this.mesh.material)),this.bridgeMesh&&this.mesh.add(ro(this.bridgeMesh))}nearest(e,t){return this.surface.nearest(e,t)}contains(e,t){return e>=this.minX&&t>=this.minZ&&e<this.minX+(this.columns-1)*this.spacing&&t<this.minZ+(this.rows-1)*this.spacing}heightAt(e,t){return Ta(this,e,t)}groundHeightAt(e,t){return Ta(this.groundQuery??this,e,t)}waterwayHeightAt(e,t){let n=this.groundHeightAt(e,t);return this.riverChannels?.bedHeightAt(e,t)??n}exteriorHeightAt(e,t){return Ta(this.exteriorQuery??this.groundQuery??this,e,t)}normalAt(e,t){return Ea(this,e,t)}isAsphalt(e){return this.surface.isAsphalt(e)}physicsData(){let{spacing:e,columns:t,rows:n,minX:r,minZ:i,heights:a,minHeight:o,maxHeight:s,flippedCells:c,warpedCells:l,warpedVertices:u,filletVertices:d,filletCells:f,collisionMesh:p,groundSurface:m,bridgeMesh:h,segments:g,halfWidth:_,asphaltSpans:v,padRadius:y}=this;return{spacing:e,columns:t,rows:n,minX:r,minZ:i,heights:a,minHeight:o,maxHeight:s,flippedCells:c,warpedCells:l,warpedVertices:u,filletVertices:d,filletCells:f,collisionMesh:p,groundSurface:m,bridgeMesh:h,segments:g,halfWidth:_,asphaltSpans:v,padRadius:y}}setCastShadow(e){this.mesh.castShadow=e;for(let t of this.groundMeshes)t.castShadow=e}setSceneryRoadDistance(e){let t=this.mesh.geometry.getAttribute(`sceneryRoad`);if(!t)return;let n=this.mesh.geometry.getAttribute(`position`);for(let r=0;r<t.count;r++)t.setX(r,e(n.getX(r),n.getZ(r)));t.needsUpdate=!0}projectGeometry(e,t){return ho(this,e,t)}projectGroundGeometry(e,t,n=!1){let r=this.groundQuery??this;if(!this.groundTriangles){let e=mo(r,this.mesh.geometry),t=this.mesh.getObjectByName(`tunnel-floor`),n=t instanceof z?mo(r,t.geometry):void 0;this.groundTriangles=function*(t){yield*e(t),n&&(yield*n(t))}}return ho(r,e,t,this.groundTriangles,n)}};function mo(e,t){let n=new Map,r=t.getAttribute(`position`),i=t.getIndex();if(!i)throw Error(`Terrain projection requires indexed ground geometry`);for(let e=0;e<i.count;e+=3){let t=i.getX(e),a=i.getX(e+1),o=i.getX(e+2),s=Math.min(r.getX(t),r.getX(a),r.getX(o)),c=Math.max(r.getX(t),r.getX(a),r.getX(o)),l=Math.min(r.getZ(t),r.getZ(a),r.getZ(o)),u=Math.max(r.getZ(t),r.getZ(a),r.getZ(o)),d=2**Math.ceil(Math.log2(Math.max(4,c-s,u-l))),f=n.get(d)??new Map;n.set(d,f);for(let t=Math.floor(l/d);t<=Math.floor(u/d);t++)for(let n=Math.floor(s/d);n<=Math.floor(c/d);n++){let r=xa(n,t),i=f.get(r);i?i.push(e):f.set(r,[e])}}let a=new Uint32Array(i.count/3),o=0,s=[new I,new I,new I],c=e=>{for(let t=0;t<3;t++)s[t].fromBufferAttribute(r,i.getX(e+t));return s};return function*({minX:e,maxX:t,minZ:r,maxZ:i}){let s=++o;for(let[o,l]of n)for(let n=Math.floor(r/o);n<=Math.floor(i/o);n++)for(let r=Math.floor(e/o);r<=Math.floor(t/o);r++)for(let e of l.get(xa(r,n))??[])a[e/3]!==s&&(a[e/3]=s,yield c(e))}}function ho(e,t,n,r,i=!1){let a=[],o=[],s=t.getAttribute(`position`),c=t.getIndex(),l=[`lateral`,`structure`,`elevation`].map(e=>({name:e,source:t.getAttribute(e),values:[],corners:[0,0,0]})).filter(({source:e})=>e);function*u({minX:t,maxX:n,minZ:r,maxZ:i}){let a=+!!e.warpedCells,o=Math.floor((t-e.minX)/e.spacing)-a,s=Math.floor((n-e.minX)/e.spacing)+a,c=Math.floor((r-e.minZ)/e.spacing)-a,l=Math.floor((i-e.minZ)/e.spacing)+a;for(let t=Math.max(c,0);t<=Math.min(l,e.rows-2);t++)for(let n=Math.max(o,0);n<=Math.min(s,e.columns-2);n++){let r=Aa(e,n,t);for(let t=0;t<r.length;t+=3)yield r.slice(t,t+3).map(t=>{let{x:n,z:r}=Da(e,t);return new I(n,Oa(e,t),r)})}}let d=[[],[]];function f(e,t,n,r,i,a){t.length=0;let o=e.length/2;for(let s=0;s<o;s++){let c=(s+1)%o,l=e[s*2],u=e[s*2+1],d=e[c*2],f=e[c*2+1],p=(i-n)*(u-r)-(a-r)*(l-n),m=(i-n)*(f-r)-(a-r)*(d-n);if(p>=0&&t.push(l,u),p<0!=m<0){let e=p/(p-m);t.push(l+e*(d-l),u+e*(f-u))}}}for(let e=0;e<(c?.count??s.count);e+=3){let[t,p,m]=[0,1,2].map(t=>c?c.getX(e+t):e+t),h=s.getX(t),g=s.getZ(t),_=s.getX(p),v=s.getZ(p),y=s.getX(m),b=s.getZ(m),x=(_-h)*(b-g)-(y-h)*(v-g);if(Math.abs(x)<1e-8)continue;let S=0,C=0,w=(e,t)=>{S=((e-h)*(b-g)-(y-h)*(t-g))/x,C=((_-h)*(t-g)-(e-h)*(v-g))/x},T=(e,t,n)=>e+(t-e)*S+(n-e)*C,E=[s.getY(t),s.getY(p),s.getY(m)];for(let e of l)e.corners=[e.source.getX(t),e.source.getX(p),e.source.getX(m)];let D={minX:Math.min(h,_,y),maxX:Math.max(h,_,y),minZ:Math.min(g,v,b),maxZ:Math.max(g,v,b)};for(let e of(r??u)(D)){let[t,r,s]=e;if(Math.max(t.x,r.x,s.x)<D.minX||Math.min(t.x,r.x,s.x)>D.maxX||Math.max(t.z,r.z,s.z)<D.minZ||Math.min(t.z,r.z,s.z)>D.maxZ)continue;let c=r.x-s.x,u=r.y-s.y,p=r.z-s.z,m=t.x-s.x,x=t.y-s.y,S=t.z-s.z,C=u*S-p*x,O=p*m-c*S,k=c*x-u*m;if(Math.abs(O/Math.hypot(C,O,k))<1e-8)continue;let A=-(C*t.x+O*t.y+k*t.z),ee=(e,t)=>-(A+C*e+k*t)/O,j=[h,g,_,v,y,b],M=[t,s,r];for(let e=0;e<3&&j.length;e++){let t=j===d[0]?d[1]:d[0],n=M[e],r=M[(e+1)%3];f(j,t,n.x,n.z,r.x,r.z),j=t}if(i)for(let[e,t]of i===`river`?[[.025,-1]]:[[.025,-1],[.65,1]]){let n=[],r=j.length/2,i=n=>(w(j[n*2],j[n*2+1]),(ee(j[n*2],j[n*2+1])-T(...E)+e)*t);for(let e=0;e<r;e++){let t=(e+1)%r,a=i(e),o=i(t);if(a>=0&&n.push(j[e*2],j[e*2+1]),a>=0!=o>=0){let r=a/(a-o);n.push(j[e*2]+(j[t*2]-j[e*2])*r,j[e*2+1]+(j[t*2+1]-j[e*2+1])*r)}}j=n}let te=j.length/2;for(let e=1;e<te-1;e++)for(let t of[0,e,e+1]){let e=j[t*2],r=j[t*2+1];w(e,r),a.push(e,i?T(...E):ee(e,r)+n,r),o.push(e/5,r/5);for(let e of l)e.values.push(T(...e.corners))}}}let m=new Y;m.setAttribute(`position`,new p(a,3)),m.setAttribute(`uv`,new p(o,2));for(let{name:e,values:t}of l)m.setAttribute(e,new p(t,1));return m.computeVertexNormals(),m}function go(e){let t=Math.max(1,Math.round(e.length/400)),n=e.filter((e,n)=>n%t===0),r=new Ae;n.forEach(({x:e,z:t})=>r.expandByPoint(new H(e,t))),r.expandByScalar(300);let i=Math.ceil((r.max.x-r.min.x)/12)+1,a=Math.ceil((r.max.y-r.min.y)/12)+1,o=new Float32Array(i*a);for(let e=0;e<a;e++)for(let t=0;t<i;t++){let a=r.min.x+t*12,s=r.min.y+e*12,c=0,l=0;for(let e of n){let t=1/((a-e.x)**2+(s-e.z)**2+1600);c+=e.height*t,l+=t}o[e*i+t]=c/l}return(e,t)=>{let n=L.clamp((e-r.min.x)/12,0,i-1.000001),s=L.clamp((t-r.min.y)/12,0,a-1.000001),c=Math.floor(n),l=Math.floor(s),u=l*i+c,d=L.lerp(o[u],o[u+1],n-c),f=L.lerp(o[u+i],o[u+i+1],n-c);return L.lerp(d,f,s-l)}}var _o=20,vo=6;function yo(e,t,n,r,i){let a=(t,n,r)=>(e[n*3]-e[t*3])*(e[r*3+2]-e[t*3+2])-(e[r*3]-e[t*3])*(e[n*3+2]-e[t*3+2])<-.01;return[a(t,r,n)&&a(n,r,i),a(t,r,i)&&a(t,i,n)]}function bo(e,t,n,r,i){let a=(...t)=>t.some(t=>e[t]<-.001)&&t.some(t=>e[t]>.001);return[a(t,n,r)||a(n,r,i),a(t,r,i)||a(t,i,n)]}function xo(e,t,n,r,i){let a=new Uint8Array((n-1)*(r-1));for(let o=0;o<r-1;o++)for(let r=0;r<n-1;r++){let s=o*n+r,c=s+1,l=s+n,u=l+1,d=Math.min(t[s],t[c],t[l],t[u]),f=Math.max(t[s],t[c],t[l],t[u]),[p,m]=yo(i,s,c,l,u),[h,g]=bo(t,s,c,l,u),_=Math.abs(t[c]-t[l])<.001,v=Math.abs(t[s]-t[u])<.001;m===p?f>.001&&d<=_o&&(a[o*(n-1)+r]=Number(h===g?_===v?Math.abs(e[c]-e[l])>Math.abs(e[s]-e[u]):v:h)):a[o*(n-1)+r]=Number(m)}return a}var So={type:`change`},Co={type:`start`},wo={type:`end`},To=new be,Eo=new M,Do=Math.cos(70*L.DEG2RAD),Oo=new I,ko=2*Math.PI,$={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Ao=1e-6,jo=class extends ce{constructor(e,t=null){super(e,t),this.state=$.NONE,this.target=new I,this.cursor=new I,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:ve.ROTATE,MIDDLE:ve.DOLLY,RIGHT:ve.PAN},this.touches={ONE:me.ROTATE,TWO:me.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new I,this._lastQuaternion=new ae,this._lastTargetPosition=new I,this._quat=new ae().setFromUnitVectors(e.up,new I(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new A,this._sphericalDelta=new A,this._scale=1,this._panOffset=new I,this._rotateStart=new H,this._rotateEnd=new H,this._rotateDelta=new H,this._panStart=new H,this._panEnd=new H,this._panDelta=new H,this._dollyStart=new H,this._dollyEnd=new H,this._dollyDelta=new H,this._dollyDirection=new I,this._mouse=new H,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=No.bind(this),this._onPointerDown=Mo.bind(this),this._onPointerUp=Po.bind(this),this._onContextMenu=Vo.bind(this),this._onMouseWheel=Lo.bind(this),this._onKeyDown=Ro.bind(this),this._onTouchStart=zo.bind(this),this._onTouchMove=Bo.bind(this),this._onMouseDown=Fo.bind(this),this._onMouseMove=Io.bind(this),this._interceptControlDown=Ho.bind(this),this._interceptControlUp=Uo.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=$.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(So),this.update(),this.state=$.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;Oo.copy(t).sub(this.target),Oo.applyQuaternion(this._quat),this._spherical.setFromVector3(Oo),this.autoRotate&&this.state===$.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=ko:n>Math.PI&&(n-=ko),r<-Math.PI?r+=ko:r>Math.PI&&(r-=ko),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(Oo.setFromSpherical(this._spherical),Oo.applyQuaternion(this._quatInverse),t.copy(this.target).add(Oo),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=Oo.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new I(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new I(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=Oo.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(To.origin.copy(this.object.position),To.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(To.direction))<Do?this.object.lookAt(this.target):(Eo.setFromNormalAndCoplanarPoint(this.object.up,this.target),To.intersectPlane(Eo,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>Ao||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Ao||this._lastTargetPosition.distanceToSquared(this.target)>Ao?(this.dispatchEvent(So),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?ko/60/60*this.autoRotateSpeed:ko/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){Oo.setFromMatrixColumn(t,0),Oo.multiplyScalar(-e),this._panOffset.add(Oo)}_panUp(e,t){this.screenSpacePanning===!0?Oo.setFromMatrixColumn(t,1):(Oo.setFromMatrixColumn(t,0),Oo.crossVectors(this.object.up,Oo)),Oo.multiplyScalar(e),this._panOffset.add(Oo)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;Oo.copy(r).sub(this.target);let i=Oo.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(ko*this._rotateDelta.x/t.clientHeight),this._rotateUp(ko*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(ko*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-ko*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(ko*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-ko*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(ko*this._rotateDelta.x/t.clientHeight),this._rotateUp(ko*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new H,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function Mo(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function No(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function Po(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(wo),this.state=$.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function Fo(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case ve.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=$.DOLLY;break;case ve.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=$.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=$.ROTATE}break;case ve.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=$.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=$.PAN}break;default:this.state=$.NONE}this.state!==$.NONE&&this.dispatchEvent(Co)}function Io(e){switch(this.state){case $.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case $.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case $.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function Lo(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===$.NONE&&(e.preventDefault(),this.dispatchEvent(Co),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(wo))}function Ro(e){this.enabled!==!1&&this._handleKeyDown(e)}function zo(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case me.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=$.TOUCH_ROTATE;break;case me.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=$.TOUCH_PAN;break;default:this.state=$.NONE}break;case 2:switch(this.touches.TWO){case me.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=$.TOUCH_DOLLY_PAN;break;case me.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=$.TOUCH_DOLLY_ROTATE;break;default:this.state=$.NONE}break;default:this.state=$.NONE}this.state!==$.NONE&&this.dispatchEvent(Co)}function Bo(e){switch(this._trackPointer(e),this.state){case $.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case $.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case $.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case $.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=$.NONE}}function Vo(e){this.enabled!==!1&&e.preventDefault()}function Ho(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function Uo(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}export{ra as A,da as B,Xi as C,Wi as D,Qi as E,$i as F,hi as G,Ci as H,sa as I,Q as J,_t as K,ua as L,Yi as M,pa as N,Ji as O,oa as P,fa as R,ba as S,ia as T,Si as U,Vi as V,fi as W,di as X,Et as Y,wa as _,ro as a,va as b,Na as c,Ba as d,Ha as f,Ca as g,ja as h,no as i,ea as j,Ui as k,Wa as l,Ga as m,po as n,Ya as o,Ua as p,Z as q,ho as r,Ma as s,jo as t,Va as u,xa as v,ta as w,_a as x,ya as y,na as z};