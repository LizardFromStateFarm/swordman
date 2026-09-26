// Clan surnames + given names for M2 Life Loop (Phase 30/31, task 2.2). Pinyin only, xianxia flavor, data only.
// Used by: renderer/engine/persons.js (Persons.rollGiven/rollSurname). Reused by M4's living-world names (PLAN.md).

const SURNAMES = [
  'Lin', 'Chen', 'Su', 'Ye', 'Mu', 'Xiao', 'Han', 'Yun', 'Feng', 'Xue',
  'Bai', 'Qin', 'Jiang', 'Shen', 'Wei', 'Zhao', 'Song', 'Tang', 'Yang', 'Zhou',
  'Wu', 'Zheng', 'Xu', 'Liang', 'Luo', 'Meng', 'Lu', 'Gu', 'Fang', 'Tan',
  'Qi', 'Kong', 'Cui', 'Pei', 'Yan', 'Rong', 'Xiang', 'Gao', 'Cheng', 'Bao',
  'Ren', 'Kang', 'Zou', 'Fan', 'Qian', 'Dong', 'He', 'Ling', 'Mo', 'Ning',
  'Jin', 'Yin', 'Chu', 'Hong', 'Wan', 'Sang', 'Ouyang', 'Sima', 'Murong', 'Nangong',
]

// ~30 single-syllable + ~175 two-syllable combinations, gender-neutral (M2 has no gender field).
const GIVEN_NAMES = [
  'Mei', 'Qiu', 'Feng', 'Xue', 'Yun', 'Chen', 'Ling', 'Yu', 'Xin', 'Han',
  'Rui', 'Jing', 'Yan', 'Hao', 'Xuan', 'Chun', 'Bai', 'Le', 'Yi', 'Zhi',
  'Wen', 'Xiang', 'Ning', 'Kai', 'Shu', 'Tian', 'Nian', 'Fei', 'Lan', 'Zhen',
  'Meifeng', 'Meiyun', 'Meixue', 'Meiling', 'Meiyu', 'Meixin', 'Meihua', 'Meirou', 'Meijie', 'Meichen',
  'Meixuan', 'Meihan', 'Meiyi', 'Meibing', 'Meiwen', 'Meizhu', 'Meiyao', 'Meisong', 'Meiying', 'Meizhen',
  'Meixiao', 'Meiran', 'Meiqi', 'Meishan', 'Meilei', 'Meichuan', 'Meixing', 'Meitao', 'Meimeng', 'Meidan',
  'Qiufeng', 'Qiuyun', 'Qiuxue', 'Qiuling', 'Qiuyu', 'Qiuxin', 'Qiuhua', 'Qiurou', 'Qiujie', 'Qiuchen',
  'Qiuxuan', 'Qiuhan', 'Qiuyi', 'Qiubing', 'Qiuwen', 'Qiuzhu', 'Qiuyao', 'Qiusong', 'Qiuying', 'Qiuzhen',
  'Qiuxiao', 'Qiuran', 'Qiuqi', 'Qiushan', 'Qiulei', 'Qiuchuan', 'Qiuxing', 'Qiutao', 'Qiumeng', 'Qiudan',
  'Yunfeng', 'Yunxue', 'Yunling', 'Yunyu', 'Yunxin', 'Yunhua', 'Yunrou', 'Yunjie', 'Yunchen', 'Yunxuan',
  'Yunhan', 'Yunyi', 'Yunbing', 'Yunwen', 'Yunzhu', 'Yunyao', 'Yunsong', 'Yunying', 'Yunzhen', 'Yunxiao',
  'Yunran', 'Yunqi', 'Yunshan', 'Yunlei', 'Yunchuan', 'Yunxing', 'Yuntao', 'Yunmeng', 'Yundan', 'Xuefeng',
  'Xueyun', 'Xueling', 'Xueyu', 'Xuexin', 'Xuehua', 'Xuerou', 'Xuejie', 'Xuechen', 'Xuexuan', 'Xuehan',
  'Xueyi', 'Xuebing', 'Xuewen', 'Xuezhu', 'Xueyao', 'Xuesong', 'Xueying', 'Xuezhen', 'Xuexiao', 'Xueran',
  'Xueqi', 'Xueshan', 'Xuelei', 'Xuechuan', 'Xuexing', 'Xuetao', 'Xuemeng', 'Xuedan', 'Fengyun', 'Fengxue',
  'Fengling', 'Fengyu', 'Fengxin', 'Fenghua', 'Fengrou', 'Fengjie', 'Fengchen', 'Fengxuan', 'Fenghan', 'Fengyi',
  'Fengbing', 'Fengwen', 'Fengzhu', 'Fengyao', 'Fengsong', 'Fengying', 'Fengzhen', 'Fengxiao', 'Fengran', 'Fengqi',
  'Fengshan', 'Fenglei', 'Fengchuan', 'Fengxing', 'Fengtao', 'Fengmeng', 'Fengdan', 'Lingfeng', 'Lingyun', 'Lingxue',
  'Lingyu', 'Lingxin', 'Linghua', 'Lingrou', 'Lingjie', 'Lingchen', 'Lingxuan', 'Linghan', 'Lingyi', 'Lingbing',
  'Lingwen', 'Lingzhu', 'Lingyao', 'Lingsong', 'Lingying', 'Lingzhen', 'Lingxiao', 'Lingran', 'Lingqi', 'Lingshan',
  'Linglei', 'Lingchuan', 'Lingxing', 'Lingtao', 'Lingmeng',
]
