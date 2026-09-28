// Rig for the 3D project — DATA ONLY. Edit it in the rig editor; do not hand-edit the numbers.
// Source: voxel · undefined · slots {}. Spec: 3d/RIG-FORMAT.md.
const RIG = {
  "v": 1,
  "space": "3d",
  "source": {
    "kind": "voxel",
    "model": "models/synthetic.vox",
    "space": "3d"
  },
  "canvas": [
    10,
    6,
    20
  ],
  "skeleton": {
    "root": {
      "parent": null,
      "pos": [
        5,
        3,
        0.4
      ]
    },
    "hips": {
      "parent": "root",
      "pos": [
        0,
        0,
        8.8
      ]
    },
    "spine": {
      "parent": "hips",
      "pos": [
        0,
        0,
        2.8000000000000003
      ]
    },
    "chest": {
      "parent": "spine",
      "pos": [
        0,
        0,
        2.4
      ]
    },
    "neck": {
      "parent": "chest",
      "pos": [
        0,
        0,
        1.6
      ]
    },
    "head": {
      "parent": "neck",
      "pos": [
        0,
        0,
        1.7999999999999998
      ]
    },
    "armL": {
      "parent": "chest",
      "pos": [
        -2.2,
        0,
        -0.4
      ]
    },
    "handL": {
      "parent": "armL",
      "pos": [
        -0.6,
        0,
        -4.4
      ]
    },
    "armR": {
      "parent": "chest",
      "pos": [
        2.2,
        0,
        -0.4
      ]
    },
    "handR": {
      "parent": "armR",
      "pos": [
        0.6,
        0,
        -4.4
      ]
    },
    "legL": {
      "parent": "hips",
      "pos": [
        -1,
        0,
        -4.4
      ]
    },
    "footL": {
      "parent": "legL",
      "pos": [
        0,
        0,
        -4.4
      ]
    },
    "legR": {
      "parent": "hips",
      "pos": [
        1,
        0,
        -4.4
      ]
    },
    "footR": {
      "parent": "legR",
      "pos": [
        0,
        0,
        -4.4
      ]
    }
  },
  "attachments": [
    {
      "group": "hips",
      "bone": "hips",
      "count": 24,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 7,
        "x1": 7,
        "y1": 5,
        "z1": 11
      },
      "pivot": [
        5,
        3,
        8.83
      ]
    },
    {
      "group": "spine",
      "bone": "spine",
      "count": 32,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 11,
        "x1": 7,
        "y1": 5,
        "z1": 13
      },
      "pivot": [
        5,
        3,
        12
      ]
    },
    {
      "group": "chest",
      "bone": "chest",
      "count": 16,
      "box": {
        "x0": 4,
        "y0": 1,
        "z0": 13,
        "x1": 6,
        "y1": 5,
        "z1": 15
      },
      "pivot": [
        5,
        3,
        14
      ]
    },
    {
      "group": "neck",
      "bone": "neck",
      "count": 32,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 15,
        "x1": 7,
        "y1": 5,
        "z1": 17
      },
      "pivot": [
        5,
        3,
        16
      ]
    },
    {
      "group": "head",
      "bone": "head",
      "count": 48,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 17,
        "x1": 7,
        "y1": 5,
        "z1": 20
      },
      "pivot": [
        5,
        3,
        18.5
      ]
    },
    {
      "group": "armL",
      "bone": "armL",
      "count": 24,
      "box": {
        "x0": 1,
        "y0": 1,
        "z0": 12,
        "x1": 4,
        "y1": 5,
        "z1": 16
      },
      "pivot": [
        2.17,
        3,
        14
      ]
    },
    {
      "group": "handL",
      "bone": "handL",
      "count": 12,
      "box": {
        "x0": 1,
        "y0": 1,
        "z0": 9,
        "x1": 4,
        "y1": 5,
        "z1": 12
      },
      "pivot": [
        2.83,
        3,
        10.5
      ]
    },
    {
      "group": "armR",
      "bone": "armR",
      "count": 24,
      "box": {
        "x0": 6,
        "y0": 1,
        "z0": 12,
        "x1": 9,
        "y1": 5,
        "z1": 16
      },
      "pivot": [
        7.83,
        3,
        14
      ]
    },
    {
      "group": "handR",
      "bone": "handR",
      "count": 12,
      "box": {
        "x0": 6,
        "y0": 1,
        "z0": 9,
        "x1": 9,
        "y1": 5,
        "z1": 12
      },
      "pivot": [
        7.17,
        3,
        10.5
      ]
    },
    {
      "group": "legL",
      "bone": "legL",
      "count": 16,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 3,
        "x1": 4,
        "y1": 5,
        "z1": 7
      },
      "pivot": [
        3.5,
        3,
        5
      ]
    },
    {
      "group": "footL",
      "bone": "footL",
      "count": 12,
      "box": {
        "x0": 3,
        "y0": 1,
        "z0": 0,
        "x1": 4,
        "y1": 5,
        "z1": 3
      },
      "pivot": [
        3.5,
        3,
        1.5
      ]
    },
    {
      "group": "legR",
      "bone": "legR",
      "count": 16,
      "box": {
        "x0": 6,
        "y0": 1,
        "z0": 3,
        "x1": 7,
        "y1": 5,
        "z1": 7
      },
      "pivot": [
        6.5,
        3,
        5
      ]
    },
    {
      "group": "footR",
      "bone": "footR",
      "count": 12,
      "box": {
        "x0": 6,
        "y0": 1,
        "z0": 0,
        "x1": 7,
        "y1": 5,
        "z1": 3
      },
      "pivot": [
        6.5,
        3,
        1.5
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
              0,
              0,
              0
            ]
          },
          {
            "t": 1.2,
            "pose": [
              0,
              0,
              0,
              0.5
            ]
          },
          {
            "t": 2.4,
            "pose": [
              0,
              0,
              0,
              0
            ]
          }
        ]
      }
    },
    "walk": {
      "loop": true,
      "rate": 1,
      "feels": {
        "legL": [
          {
            "t": 0,
            "pose": [
              0,
              0,
              0,
              0
            ]
          },
          {
            "t": 0.5,
            "pose": [
              0,
              0,
              0,
              1.2
            ]
          },
          {
            "t": 1,
            "pose": [
              0,
              0,
              0,
              0
            ]
          }
        ],
        "legR": [
          {
            "t": 0,
            "pose": [
              0,
              0,
              0,
              1.2
            ]
          },
          {
            "t": 0.5,
            "pose": [
              0,
              0,
              0,
              0
            ]
          },
          {
            "t": 1,
            "pose": [
              0,
              0,
              0,
              1.2
            ]
          }
        ],
        "armL": [
          {
            "t": 0,
            "pose": [
              0,
              0,
              0,
              0
            ]
          },
          {
            "t": 0.5,
            "pose": [
              0,
              0,
              0,
              -0.6
            ]
          },
          {
            "t": 1,
            "pose": [
              0,
              0,
              0,
              0
            ]
          }
        ],
        "armR": [
          {
            "t": 0,
            "pose": [
              0,
              0,
              0,
              -0.6
            ]
          },
          {
            "t": 0.5,
            "pose": [
              0,
              0,
              0,
              0
            ]
          },
          {
            "t": 1,
            "pose": [
              0,
              0,
              0,
              -0.6
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
    "generator": "autobind-voxel@1"
  }
};
