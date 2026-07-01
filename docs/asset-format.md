# Asset format

Each official asset may live in its own folder.

```txt
assets/official/furniture/sofa_green_01/
  sofa_green_01.png
  sofa_green_01.json
```

Example metadata:

```json
{
  "id": "sofa_green_01",
  "name": "Green Sofa 01",
  "category": "furniture",
  "image": "assets/official/furniture/sofa_green_01/sofa_green_01.png",
  "defaultDepth": 0.55,
  "anchor": "bottom-center",
  "collisionBox": [0.18, 0.72, 0.82, 1.0],
  "tags": ["living room", "green", "sofa"]
}
```

The scene JSON stores references and object properties. It should not embed image data for official assets.
