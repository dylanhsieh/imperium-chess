# Imagegen material asset

Built-in `image_gen` generated one atlas, then local Canvas preprocessing resized it to 1024px and derived tangent micro normals. The user's latest explicit imagegen request authorizes this tool for the material pass. Browser runtime loads only local bundled assets; there are no generation/API calls in the game.

Saved project assets:

- `src/assets/ancient-color-atlas.webp` — 383,666 bytes, 1024², four material swatches.
- `src/assets/ancient-normal-atlas.webp` — 572,370 bytes, 1024², derived from the source detail, compressed at quality .95.
- `artifacts/v3.1/material-atlas-source.png` — original generated output, retained for reproducibility.

Two maps are shared by both armies. In enhanced mode the generated micro detail affects base-color variation, roughness and tangent normals, preserving the established faction palette. Metal, brass, leather and cloth receive their respective swatch. Skin/horse/world materials retain their authored treatment. Basic mode uses the simpler PBR shaders. Texture borders are inset to prevent adjacent swatch bleed. Normal amplitude is restrained so forged surfaces remain smooth rather than looking damaged.

Final prompt (built-in tool, no CLI fallback):

+Use case: stylized-concept. Asset type: one production PBR material atlas for a cinematic ancient-army Three.js chess game. Make a perfectly square 2 by 2 grid filling the entire image, four equal square texture swatches with exact straight boundaries at 50% width/height, no margins or labels. Top left: neutral pale forged steel / silver armor, fine directional brushed metal, very subtle tiny worn hairline scratches, mostly even light gray. Top right: antique golden brass, warm muted brass with subtle brushed grain and sparse tiny wear, mostly even muted gold. Bottom left: rich medium-dark brown aged leather, subtle irregular pores and creases, no stitching or objects. Bottom right: neutral medium gray finely woven linen cloth, uniform intricate threads, no folds or seams. Each quadrant is a flat orthographic close-up MATERIAL TEXTURE / albedo map, each independently repeatable and evenly lit, seamless edge appearance. Historical armor workshop quality, realistic micro surface detail but restrained contrast so shader lighting can add reflection. NO perspective, NO 3D rendered objects, NO highlights or specular glare, NO baked shadows, NO borders, NO text, NO watermarks. The textures should be clean physically useful material maps, not a collage of products. Crisp high resolution detail.
