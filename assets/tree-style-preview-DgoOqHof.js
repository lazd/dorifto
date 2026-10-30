import{i as e,o as t}from"./scenery-CFJ0KYNT.js";function n(n,r){let i=document.querySelector(`#tree-style-preview`);if(i)return i.dispatchEvent(new Event(`coursechange`)),i;let a=document.querySelector(`#vegetation-detail`)?.closest(`section`);if(!a)throw Error(`Vegetation settings are not available`);let o=document.createElement(`div`);o.className=`field`,o.id=`tree-style-preview`,o.innerHTML=`
    <label for="tree-style">Vegetation rendering</label>
    <p id="tree-style-description">Baked pine, oak, aspen and three bush styles.
      Performance uses shorter mesh ranges and fewer bushes; Quality draws more detail.
      Ultra uses 3D meshes throughout, with no baked distant plants.
      Vegetation detail controls density; Ultra tree ranges are 180 / 300 / 450 meters.</p>
    <select id="tree-style" aria-describedby="tree-style-description">
      <option value="performance">Performance</option>
      <option value="quality" selected>Quality</option>
      <option value="ultra">Ultra</option>
    </select>
    <label for="tree-transition">Smooth transitions</label>
    <input id="tree-transition" class="switch" role="switch" type="checkbox">
    <output id="tree-style-budget" role="status"></output>`;let s=document.createElement(`section`);s.className=`illustrated-setting`,s.append(o),a.after(s);let c=o.querySelector(`#tree-style`),l=o.querySelector(`#tree-style-budget`),u=o.querySelector(`#tree-transition`),d=new URL(location.href).searchParams.get(`tree-style`);(d===`performance`||d===`quality`||d===`ultra`)&&(c.value=d),u.checked=new URL(location.href).searchParams.get(`tree-transition`)!==`off`;function f(i){try{let r=c.value;if(r!==`performance`&&r!==`quality`&&r!==`ultra`)throw Error(`Unknown vegetation mode: ${r}`);if(e(n,r),t(n,u.checked),u.disabled=r===`ultra`,i?.type===`change`){let e=new URL(location.href);i.target===c&&e.searchParams.set(`tree-style`,r),i.target===u&&e.searchParams.set(`tree-transition`,u.checked?`on`:`off`),history.replaceState(null,``,e)}l.textContent=r===`ultra`?`3D meshes only. Higher GPU cost; no baked-to-mesh transition.`:`Shared near meshes; four-triangle distant plants. No runtime generation.`}catch(e){l.textContent=`Unable to apply vegetation mode.`,r(e)}}return c.addEventListener(`change`,f),u.addEventListener(`change`,f),o.addEventListener(`coursechange`,f),f(),o}export{n as installTreeStylePreview};