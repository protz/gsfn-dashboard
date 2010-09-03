/*  TODO
 * So far, there are a few things that we could improve with this scripts.
 * - Use a cache. If last time we checked the topic, it had N replies, and
 *   10 minutes later, it still has N replies, then we don't need to go
 *   through the N replies to figure out that the number of replies today
 *   hasn't changed (I assume it's not possible to delete a reply, but that
 *   doesn' matter much).
 * - Search keywords inside tags for topics (requires more queries)
 *
 */
if (typeof console === 'undefined' || !console.log) {
  window.console = { log: function () {}};
};

$(window).load(function () {

  $.ajaxSetup({
    cache: false // turn off AJAX caching so you actually get the top 5!
  });
  
  function range(begin, end) {
    for (let i = begin; i < end; ++i) {
      yield i;
    }
  }

  let topics = {};
  let tags = {};
  let REFRESH_INTERVAL = 600*1000;
  let hourBins = [];
  let keywordBins = {};
  /*
  gmx
  gmail
  googlemail
  yahoo
  comcast
  road runner
  roadrunner
  msn
  hotmail
   */
  let keywords = ["gmx", "g((oogle ?)?)mail", "yahoo", "comcast", "road ?runner", "msn", "hotmail"]
  // Uncomment below to fill some debug values
  /*for each (let i in range(0, 24))
    hourBins[i] = Math.random() * 100;
  for each (let i in keywords)
    keywordBins[i] = 10 * Math.random();*/

  let today = (new Date());
  function tooOld(date) {
    let d = new Date(date);
    return ((today - d) > 24 * 3600 * 1000);
  }

  // -- Display routines

  function plural(s, n) {
    let map = {
      reply: "replies",
      minute: "minutes",
    };
    return (n > 1 ? map[s] : s);
  }

  function output() {
    // Most active in the last 24 hours
    let sorted_topics = [t for each ([, t] in Iterator(topics))];
    sorted_topics.sort(function (t1, t2) {
      return (t2.replies_today - t1.replies_today);
    });
    let $ol = $(".d1").find("ol");
    $ol.empty(); // remove any leftover values
    $.each(sorted_topics, function (i, topic) {
      $ol.append(
        $("<li />").append(
          $("<a />").attr("href", topic.at_sfn).text(topic.subject)
        ).append(
          $("<span />").text(
            " ("+topic.replies_today+" "+plural("reply", topic.replies_today)+")"
          )
        )
      );
      if (i == 4)
        return false;
    });

    // Since we've been fetching all topics modified in the last 24 hours,
    // topics recently created are inside that subset.
    let last_topics = sorted_topics.concat();
    last_topics.sort(function (t1, t2) {
      return ((new Date(t1.created_at)) < (new Date(t2.created_at)));
    });
    $ol = $(".d2").find("ol");
    $ol.empty(); // remove any leftover values
    $.each(last_topics, function (i, topic) {
      let minutesAgo = Math.round((new Date() - new Date(topic.created_at))/60000);
      $ol.append(
        $("<li />").append(
          $("<a />").attr("href", topic.at_sfn).text(topic.subject)
        ).append(
          $("<span />").text(" (created "+minutesAgo+" "+plural("minute", minutesAgo)+" ago)")
        )
      );
      if (i == 4)
        return false;
    });

    // Get topics created today
    let todays_topics = sorted_topics.filter(function (topic) { return !tooOld(topic.created_at); });
    // shuffle algorithm
    let l = todays_topics.length;
    for (let i = l - 1; i >= 0; i--) {
      let j = Math.round(Math.random()*i);
      let t = todays_topics[i];
      todays_topics[i] = todays_topics[j];
      todays_topics[j] = t;
    }
    $ol = $(".d3").find("ol");
    $ol.empty(); // remove any leftover values
    $.each(todays_topics, function (i, topic) {
      let date = new Date(topic.created_at).toLocaleFormat("%I:%M%p");
      $ol.append(
        $("<li />").append(
          $("<a />").attr("href", topic.at_sfn).text(topic.subject)
        ).append(
          $("<span />").text(" (created "+date+")")
        )
      );
      if (i == 4)
        return false;
    });

    // Topics solved are a subset of today's topics
    sorted_topics.sort(function (t1, t2) { return ((new Date(t1.last_active_at)) < (new Date(t2.last_active_at))); });
    let solved_topics = sorted_topics.filter(function (topic) { return (topic.status == "complete"); });
    $ol = $(".d5").find("ol");
    $ol.empty(); // remove any leftover values
    $.each(solved_topics, function (i, topic) {
      let date = new Date(topic.last_active_at).toLocaleFormat("%I:%M%p");
      $ol.append(
        $("<li />").append(
          $("<a />").attr("href", topic.at_sfn).text(topic.subject)
        ).append(
          $("<span />").text(" (last active at "+date+")")
        )
      );
      if (i == 4)
        return false;
    });

    // Topics solved in the last 10 minutes are a subset of solved topics
    let recently_solved_topics = solved_topics.filter(function (topic) { return topic.just_solved; });
    $ol = $(".d4").find("ol");
    $.each(recently_solved_topics, function (i, topic) {
      let date = new Date().toLocaleFormat("%I:%M%p");
      $ol.prepend(
        $("<li />").append(
          $("<a />").attr("href", topic.at_sfn).text(topic.subject)
        ).append(
          $("<span />").text(" (solved sometime before "+date+")")
        )
      );
      if (i == 4)
        return false;
    });

    if (recently_solved_topics.length)
      $("#clap").get(0).play();

    $(".status").text("Last update @"+(new Date()).toLocaleFormat("%I:%M%p"));
  }

  function temperature(time, value) {
    /* this function is a quick hack trying to make noon be hot, and midnight
      be cold */
    let hue = (235 + 120 * (1-Math.abs(time - 12) / 12)) % 360;
    hue = hue / 360;
    let saturation = .8; // avoid being garish
    let lightness = .3;
    c = hsla(hue, saturation, lightness, 1);
    return c;
  }

  function graphCommentPattern () {
    $("#n_comments").text(pv.sum(hourBins));

    let max = -1;
    for (let i in range(0, 24))
      if (hourBins[i] > max)
        max = hourBins[i];
    let panel = new pv.Panel();
    let padding = 20;
    panel
      .canvas(document.getElementById("comment_pattern"))
      .width(15*24+padding*2)
      .height(180)
      .add(pv.Bar)
        .data(hourBins)
        .bottom(padding)
        .width(10)
        .fillStyle(function(d) temperature(this.index/2, d/100).toHex())
        .height(function(d) d * 125 / max)
        .left(function() this.index * 15 + padding-3);
    panel.add(pv.Bar)
      .left(0)
      .bottom(padding)
      .width(0)
      .height(0)
      .anchor('bottom')
      .add(pv.Label)
      .textAlign('left')
      .textBaseline('top')
      .text("early morning");
    panel.add(pv.Bar)
      .left(15*11+padding)
      .bottom(padding)
      .width(0)
      .height(0)
      .anchor('bottom')
      .add(pv.Label)
      .textAlign('left')
      .textBaseline('top')
      .text("noon");
    panel.add(pv.Bar)
      .right(0)
      .bottom(padding)
      .width(0)
      .height(0)
      .anchor('bottom')
      .add(pv.Label)
      .textAlign('right')
      .textBaseline('top')
      .text("evening");
    /*
    panel
      .add(pv.Rule)
        .data([max])
        .top(80)
        .left(padding-5)
        .width(0)
        .strokeStyle("#000")
      .add(pv.Label)
        .textBaseline("top")
        .textAlign("right")
        .text(function (d) ""+d); */
      
    panel.root.render();
  }

  function graphKeywords() {
    let total = 0;
    for each (let [k, v] in Iterator(keywordBins))
      total += v;
    let angle = 0;
    let data = [];
    for each (let [k, v] in Iterator(keywordBins)) {
      data.push([k, v / total * 2 * Math.PI, Math.round(v)]);
      angle += v / total * 2 * Math.PI;
    }

    /* The root panel. */
    let w = 180, h = 180;
    let vis = new pv.Panel()
        .canvas("keyword_pattern")
        .width(w)
        .height(h);

    /* The wedge, with centered label. */
    vis.add(pv.Wedge)
        .data(data)
        .bottom(w / 2)
        .left(w / 2)
        .innerRadius(0)
        .outerRadius(w / 2)
        .angle(function (d) d[1])
      .anchor("center").add(pv.Label)
        .visible(function(d) d[1] > .15)
        .textAngle(0)
        .text(function(d) d[0] + "("+d[2]+")");

    vis.root.render();
  }

  function cleanup (s) {
    let r = s.replace(/(add-ons?|addons|emails|e-mails?|!|messages|but|are|can|with|the|that|not|and|can't|will|(^\d+$))/g, function (s2) {
      switch (s2) {
        case "add-ons":
        case "add-on":
        case "addons":
          return "addon";
        case "e-mail":
        case "e-mails":
        case "emails":
          return "email";
        case "!":
          return "";
        case "messages":
          return "message";
        default:
          // avoid canonical -> onical
          if (s2.length == s.length)
            return "";
          else
            return s2;
      }
    });
    return (r.length > 2 ? r : "");
  }

  function graphTagCloud() {
    let sorted_tags = [x for each ([, x] in Iterator(tags))];
    let sub_tag_count = {};
    $.each(sorted_tags, function (i, tag_list) {
      let sub_tags = tag_list[0].name.split(" ");
      sub_tags = sub_tags.map(cleanup);
      $.each(sub_tags, function (i, sub_tag) {
        if (!(sub_tag in sub_tag_count))
          sub_tag_count[sub_tag] = 0;
        sub_tag_count[sub_tag]++;
      });
    });
    sub_tag_count = [[k, v] for each ([k, v] in Iterator(sub_tag_count))];
    sub_tag_count.sort(function ([k1,], [k2,]) String.localeCompare(k1, k2));
    let $box = $("#tag_cloud");
    $box.empty();
    $.each(sub_tag_count, function (i, [k, v]) {
      if (v > 1 && k.length) {
        let $tag = $("<span />")
          .text(k+" ")
          .css("font-size", 8+v);
        $box.append($tag);
      }
    });
  }

  function graph () {
    graphCommentPattern();
    graphKeywords();
    graphTagCloud();
  }

  // -- JSON stuff

  let expected = 1; // for the main loop

  function top() {
    expected--;
    if (expected == 0) {
      output();
      graph();
    } else if (expected < 0) {
      console.log("Errrrrrrrrror");
    }
  }

  function getTopics(page){
    console.log("getTopics", page);

    let url =
      "http://api.getsatisfaction.com/products/mozilla_thunderbird/topics.json?sort=recently_active&page="
      + page + "&limit=30&callback=?";
    $.getJSON(
      url,
      function _getTopics_loop (gsjs) { // gsjs is the JSON object from getsatisfaction
        let keep_going = true;

        // iterate on all topics
        $.each(gsjs.data, function(i, topic) {
          // we've been too far, and we ended up in some other day's topics
          if (tooOld(topic.last_active_at)) {
            keep_going = false;
            return false; // break
          }
          // is this a newly solved topic?
          if ((topic.id in topics) && topics[topic.id].status != "complete" && topic.status == "complete")
            topic.just_solved = true;
          // add some properties, erase the old topic
          topic.replies_today = 0;
          topics[topic.id] = topic;
          // match keywords
          for each (let [, keyword] in Iterator(keywords)) {
            let match = topic.content.match(new RegExp(keyword, "gi"));
            if (match)
              keywordBins[keyword] += match.length;
          }
          if (topic.reply_count > 1) {
            expected++;
            expected++;
            getReplies(topic, topic.reply_count - 1, 1);
            getTags(topic);
          }
        });

        if (keep_going && gsjs.data.length)
          getTopics(page + 1);
        else
          top();
    });
  };

  function getReplies(topic, remaining, page) {
    console.log("getReplies", topic, remaining, page);

    // update the UI
    // $(".status").text($(".status").text()+".");

    let url =
      "http://api.getsatisfaction.com/topics/" +topic.id +
      "/replies.json?sort=recently_created&page=" + page + "&limit=30&callback=?";
    $.getJSON(
      url,
      function _getReplies_loop (gsjs) { //gsjs is the JSON object from getsatisfaction
        let keep_going = true;

        // iterate on all replies
        $.each(gsjs.data, function(i, reply) {
          if (tooOld(reply.created_at)) {
            keep_going = false;
            return false;
          } else {
            // Fill the bins
            hourBins[(new Date(reply.created_at)).getHours()]++;
            for each (let [, keyword] in Iterator(keywords)) {
              let match = reply.content.match(new RegExp(keyword, "gi"));
              if (match)
                keywordBins[keyword] += match.length;
            }
            topic.replies_today++;
            remaining--;
          }
        });

        if (remaining <= 0)
          keep_going = false;

        if (keep_going && gsjs.data.length)
          getReplies(topic, remaining, page + 1);
        else
          top();
      }
    );
  };

  function getTags(topic) {
    console.log("getTags", topic);

    let url =
      "http://api.getsatisfaction.com/topics/" +topic.id +
      "/tags.json?callback=?";
    $.getJSON(
      url,
      function _getTags (gsjs) { // we assume no more than one page of tags
        $.each(gsjs.data, function(i, tag) {
          if (!(tag.name in tags))
            tags[tag.name] = [];
          tags[tag.name].push(tag);
        });
        top();
      }
    );
  }

  // Called every ten minutes to update the UI
  function poll () {
    // reset globals
    expected = 1;
    tags = {};
    for each (let i in range(0, 24))
      hourBins[i] = 0;
    for each (let [, keyword] in Iterator(keywords))
      keywordBins[keyword] = 0;

    getTopics(1);

    setTimeout(poll, REFRESH_INTERVAL);
  }

  poll();
  // For debug
  //graph();

});
