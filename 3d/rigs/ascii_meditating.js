// Rig for the 3D project — DATA ONLY. Edit it in the rig editor; do not hand-edit the numbers.
// Source: ascii · meditating · slots {}. Spec: 3d/RIG-FORMAT.md.
const RIG = {
  "v": 1,
  "space": "2d",
  "source": {
    "kind": "ascii",
    "state": "meditating",
    "regions": 3
  },
  "canvas": [
    300,
    172
  ],
  "skeleton": {
    "root": {
      "parent": null,
      "pos": [
        150.2,
        150
      ]
    },
    "hips": {
      "parent": "root",
      "pos": [
        0,
        -21.33
      ]
    },
    "spine": {
      "parent": "hips",
      "pos": [
        0,
        -42.67
      ]
    },
    "head": {
      "parent": "spine",
      "pos": [
        0,
        -42.67
      ]
    }
  },
  "attachments": [
    {
      "part": "band0",
      "bone": "head",
      "layer": "region",
      "pivot": [
        150.2,
        43.34
      ]
    },
    {
      "part": "band1",
      "bone": "spine",
      "layer": "region",
      "pivot": [
        150.2,
        86
      ]
    },
    {
      "part": "band2",
      "bone": "hips",
      "layer": "region",
      "pivot": [
        150.2,
        128.67
      ]
    }
  ],
  "ik": [],
  "tracks": {
    "idle": {
      "loop": true,
      "rate": 1,
      "feels": {
        "spine": [
          {
            "t": 0,
            "pose": [
              0,
              0
            ]
          },
          {
            "t": 1.4,
            "pose": [
              0,
              -0.6
            ]
          },
          {
            "t": 2.8,
            "pose": [
              0,
              0
            ]
          }
        ],
        "head": [
          {
            "t": 0,
            "pose": [
              0,
              0
            ]
          },
          {
            "t": 1.8,
            "pose": [
              0.03,
              0
            ]
          },
          {
            "t": 3.6,
            "pose": [
              0,
              0
            ]
          }
        ]
      }
    }
  },
  "meta": {
    "autoRig": true,
    "humanTouched": [],
    "review": null,
    "generator": "autobind-ascii@1"
  }
};
