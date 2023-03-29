import notification from "./utils/notification-kit";
const JuejinHelper = require("juejin-helper");
const utils = require("./utils/utils");
const env = require("./utils/env");
import axios, { AxiosInstance } from "axios";


class Task {
  constructor(juejin) {
    this.juejin = juejin;
  }

  taskName = "";

  async run() {}

  toString() {
    return `[${this.taskName}]`;
  }
}

class GrowthTask extends Task {
  taskName = "成长任务";

  todayStatus = 0; // 未签到
  incrPoint = 0;
  sumPoint = 0; // 当前矿石数
  contCount = 0; // 连续签到天数
  sumCount = 0; // 累计签到天数

  async run() {
    const growth = this.juejin.growth();

    const todayStatus = await growth.getTodayStatus();
    if (!todayStatus) {
      const checkInResult = await growth.checkIn();

      this.incrPoint = checkInResult.incr_point;
      this.sumPoint = checkInResult.sum_point;
      this.todayStatus = 1; // 本次签到
    } else {
      this.todayStatus = 2; // 已签到
    }

    const counts = await growth.getCounts();
    this.contCount = counts.cont_count;
    this.sumCount = counts.sum_count;
  }
}

class DipLuckyTask extends Task {
  taskName = "沾喜气";

  dipStatus = 0;
  dipValue = 0;
  luckyValue = 0;

  async run() {
    const growth = this.juejin.growth();

    const luckyusersResult = await growth.getLotteriesLuckyUsers();
    if (luckyusersResult.count > 0) {
      const no1LuckyUser = luckyusersResult.lotteries[0];
      const dipLuckyResult = await growth.dipLucky(no1LuckyUser.history_id);
      if (dipLuckyResult.has_dip) {
        this.dipStatus = 2;
      } else {
        this.dipStatus = 1;
        this.dipValue = dipLuckyResult.dip_value;
      }
    }

    const luckyResult = await growth.getMyLucky();
    this.luckyValue = luckyResult.total_value;
  }
}

class BugfixTask extends Task {
  taskName = "Bugfix";

  bugStatus = 0;
  collectBugCount = 0;
  userOwnBug = 0;

  async run() {
    const bugfix = this.juejin.bugfix();

    const competition = await bugfix.getCompetition();
    const bugfixInfo = await bugfix.getUser(competition);
    this.userOwnBug = bugfixInfo.user_own_bug;

    try {
      const notCollectBugList = await bugfix.getNotCollectBugList();
      await bugfix.collectBugBatch(notCollectBugList);
      this.bugStatus = 1;
      this.collectBugCount = notCollectBugList.length;
      this.userOwnBug += this.collectBugCount;
    } catch (e) {
      this.bugStatus = 2;
    }
  }
}

class LotteriesTask extends Task {
  taskName = "抽奖";

  lottery = []; // 奖池
  pointCost = 0; // 一次抽奖消耗
  freeCount = 0; // 免费抽奖次数
  drawLotteryHistory = {};
  lotteryCount = 0;
  luckyValueProbability = 0;

  async run(growthTask, dipLuckyTask) {
    const growth = this.juejin.growth();

    const lotteryConfig = await growth.getLotteryConfig();
    this.lottery = lotteryConfig.lottery;
    this.pointCost = lotteryConfig.point_cost;
    this.freeCount = lotteryConfig.free_count;
    this.lotteryCount = 0;

    let freeCount = this.freeCount;
    while (freeCount > 0) {
      const result = await growth.drawLottery();
      this.drawLotteryHistory[result.lottery_id] = (this.drawLotteryHistory[result.lottery_id] || 0) + 1;
      dipLuckyTask.luckyValue = result.total_lucky_value;
      freeCount--;
      this.lotteryCount++;
      await utils.wait(utils.randomRangeNumber(300, 1000));
    }

    growthTask.sumPoint = await growth.getCurrentPoint();

    const getProbabilityOfWinning = sumPoint => {
      const pointCost = this.pointCost;
      const luckyValueCost = 10;
      const totalDrawsNumber = sumPoint / pointCost;
      let supplyPoint = 0;
      for (let i = 0, length = Math.floor(totalDrawsNumber * 0.65); i < length; i++) {
        supplyPoint += Math.ceil(Math.random() * 100);
      }
      const luckyValue = ((sumPoint + supplyPoint) / pointCost) * luckyValueCost + dipLuckyTask.luckyValue;
      return luckyValue / 6000;
    };

    this.luckyValueProbability = getProbabilityOfWinning(growthTask.sumPoint);
  }
}

class SdkTask extends Task {
  taskName = "埋点";

  calledSdkSetting = false;
  calledTrackGrowthEvent = false;
  calledTrackOnloadEvent = false;

  async run() {
    console.log("------事件埋点追踪-------");

    const sdk = this.juejin.sdk();

    try {
      await sdk.slardarSDKSetting();
      this.calledSdkSetting = true;
    } catch {
      this.calledSdkSetting = false;
    }
    console.log(`SDK状态: ${this.calledSdkSetting ? "加载成功" : "加载失败"}`);

    try {
      const result = await sdk.mockTrackGrowthEvent();
      if (result && result.e === 0) {
        this.calledTrackGrowthEvent = true;
      } else {
        throw result;
      }
    } catch {
      this.calledTrackGrowthEvent = false;
    }
    console.log(`成长API事件埋点: ${this.calledTrackGrowthEvent ? "调用成功" : "调用失败"}`);

    try {
      const result = await sdk.mockTrackOnloadEvent();
      if (result && result.e === 0) {
        this.calledTrackOnloadEvent = true;
      } else {
        throw result;
      }
    } catch {
      this.calledTrackOnloadEvent = false;
    }
    console.log(`OnLoad事件埋点: ${this.calledTrackOnloadEvent ? "调用成功" : "调用失败"}`);

    console.log("-------------------------");
  }
}

class MockVisitTask extends Task {
  taskName = "模拟访问";

  async run() {
    console.log("--------模拟访问---------");
    try {
      const browser = this.juejin.browser();
      await browser.open();
      try {
        await browser.visitPage("/");
        console.log("掘金首页：页面访问成功");
      } catch (e) {
        console.log("掘金首页：页面访问失败");
      }
      await utils.wait(utils.randomRangeNumber(2000, 5000));
      try {
        await browser.visitPage("/user/center/signin");
        console.log("掘金每日签到：页面访问成功");
      } catch (e) {
        console.log("掘金每日签到：页面访问失败");
      }
      await utils.wait(utils.randomRangeNumber(2000, 5000));
      await browser.close();
    } catch {
      console.log("浏览器API异常");
    }
    console.log("-------------------------");
  }
}

class Article extends Task{
  taskName='浏览文章';
  http= AxiosInstance;
  browseArticle = ''; //浏览的文章
  number = 10; //浏览的数量
  waitTime = [5000, 10000]; //等待5-10s


  constructor(juejin) {
    super(juejin);
    this.http = axios.create({
      baseURL: "https://api.juejin.cn",
      headers: {
        referer: "https://juejin.cn/",
        origin: "https://juejin.cn"
      }
    });

    this.http.interceptors.request.use(
        function (config) {
          if (!juejin) config;
          config.headers.cookie = juejin?.getCookie();

          if (juejin.user) {
            const tokens = juejin.getCookieTokens();

            // @ts-ignore
            config.url += `${config.url.indexOf("?") === -1 ? "?" : "&"}aid=${tokens.aid}&uuid=${tokens.uuid}`;
          }
          // console.log(config.url)
          return config;
        },
        function (error) {
          return Promise.reject(error);
        }
    );

    this.http.interceptors.response.use(
        function (response) {
          if (response.data.err_no) {
            throw new Error(response.data.err_msg);
          }
          return response.data.data;
        },
        function (error) {
          return Promise.reject(error);
        }
    );
  }

  /**
   * 获取文章列表
   * @returns {Promise<*>}
   */
  async getArticles() {
    return this.http.post("/recommend_api/v1/article/recommend_all_feed", {
      id_type: 2,
      client_type: 2608,
      sort_type: 200,
      cursor: "0",
      limit: 20
    });
  }
  async shuffleArticles(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  async run() {
    // 浏览文章
    console.log("");
    console.log("-------开始浏览文章-------");
    let articleData = await this.getArticles();
    let articleIdArr = [];
    for (let i in articleData) {
      let article_id = articleData[i]?.item_info?.article_id;
      if (article_id) {
        articleIdArr.push({ a_id: article_id, title: articleData[i]?.item_info?.article_info?.title });
      }
    }

    // 打乱数据
    await this.shuffleArticles(articleIdArr);
    const browser = this.juejin.browser();
    await browser.open();

    for (let i = 0; i < (articleIdArr.length > this.number ? this.number : articleIdArr.length); i++) {
      await utils.wait(utils.randomRangeNumber(...this.waitTime)); // 等待s
      try {
        await browser.visitPage("/post/"+articleIdArr[i].a_id);
      } catch (e) {
        console.log(articleIdArr[i].title + "文章访问失败");
      }
      let tmp = parseInt(i) + 1;

      this.browseArticle +=  `${tmp}、 <a href="https://juejin.cn/post/${articleIdArr[i].a_id}">${articleIdArr[i].title} </a>
`;

      // this.browseArticle.push(articleIdArr[i]);
      console.log("文章" + (i + 1) + "：" + articleIdArr[i].title);
    }
    console.log("-------结束浏览文章-------");
    console.log("");
  }

}

class CheckIn {
  cookie = "";
  username = "";

  constructor(cookie) {
    this.cookie = cookie;
  }

  async run() {
    const juejin = new JuejinHelper();
    try {
      await juejin.login(this.cookie);
    } catch (e) {
      console.error(e.message);
      throw new Error("登录失败, 请尝试更新Cookies!");
    }

    this.username = juejin.getUser().user_name;

    this.growthTask = new GrowthTask(juejin);
    this.dipLuckyTask = new DipLuckyTask(juejin);
    this.lotteriesTask = new LotteriesTask(juejin);
    this.bugfixTask = new BugfixTask(juejin);
    this.sdkTask = new SdkTask(juejin);
    this.mockVisitTask = new MockVisitTask(juejin);
    this.articleTask = new Article(juejin);

    await this.mockVisitTask.run();
    await this.sdkTask.run();
    console.log(`运行 ${this.growthTask.taskName}`);
    await this.growthTask.run();
    console.log(`运行 ${this.dipLuckyTask.taskName}`);
    await this.dipLuckyTask.run();
    console.log(`运行 ${this.lotteriesTask.taskName}`);
    await this.lotteriesTask.run(this.growthTask, this.dipLuckyTask);
    console.log(`运行 ${this.bugfixTask.taskName}`);
    await this.bugfixTask.run();
    console.log(`运行 ${this.articleTask.taskName}`);
    await this.articleTask.run();
    await juejin.logout();
    console.log("-------------------------");
  }

  toString() {
    const drawLotteryHistory = Object.entries(this.lotteriesTask.drawLotteryHistory)
      .map(([lottery_id, count]) => {
        const lotteryItem = this.lotteriesTask.lottery.find(item => item.lottery_id === lottery_id);
        if (lotteryItem) {
          return `${lotteryItem.lottery_name}: ${count}`;
        }
        return `${lottery_id}: ${count}`;
      })
      .join("\n");

    return `
掘友: ${this.username}
${
  {
    0: "签到失败",
    1: `签到成功 +${this.growthTask.incrPoint} 矿石`,
    2: "今日已完成签到"
  }[this.growthTask.todayStatus]
}
${
  {
    0: "沾喜气失败",
    1: `沾喜气 +${this.dipLuckyTask.dipValue} 幸运值`,
    2: "今日已经沾过喜气"
  }[this.dipLuckyTask.dipStatus]
}
${
  this.bugfixTask.bugStatus === 1
    ? this.bugfixTask.collectBugCount > 0
      ? `收集Bug +${this.bugfixTask.collectBugCount}`
      : "没有可收集Bug"
    : "收集Bug失败"
}
连续签到天数 ${this.growthTask.contCount}
累计签到天数 ${this.growthTask.sumCount}
当前矿石数 ${this.growthTask.sumPoint}
当前未消除Bug数量 ${this.bugfixTask.userOwnBug}
当前幸运值 ${this.dipLuckyTask.luckyValue}/6000
预测All In矿石累计幸运值比率 ${(this.lotteriesTask.luckyValueProbability * 100).toFixed(2) + "%"}
抽奖总次数 ${this.lotteriesTask.lotteryCount}
免费抽奖次数 ${this.lotteriesTask.freeCount}

浏览的文章
${this.articleTask.browseArticle}
${this.lotteriesTask.lotteryCount > 0 ? "==============\n" + drawLotteryHistory + "\n==============" : ""}
`.trim();
  }
}

async function run(args) {
  const cookies = utils.getUsersCookie(env);
  let messageList = [];
  for (let cookie of cookies) {
    const checkin = new CheckIn(cookie);

    await utils.wait(utils.randomRangeNumber(1000, 5000)); // 初始等待1-5s
    await checkin.run(); // 执行

    const content = checkin.toString();
    console.log(content); // 打印结果

    messageList.push(content);
  }

  const message = messageList.join(`\n${"-".repeat(15)}\n`);
  notification.pushMessage({
    title: "掘金每日签到",
    content: message,
    msgtype: "text"
  });
}

run(process.argv.splice(2)).catch(error => {
  notification.pushMessage({
    title: "掘金每日签到",
    content: `<strong>Error</strong><pre>${error.message}</pre>`,
    msgtype: "html"
  });

  throw error;
});
