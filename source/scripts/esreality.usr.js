﻿// ==UserScript==
// @id          esreality
// @name        ESReality.com Integration
// @version     1.3
// @author      PredatH0r
// @description	Shows a list of esreality.com Quake Live forum posts
// @unwrap
// ==/UserScript==

/*

Version 1.3
- added workaround for external links in QL Steam build

Version 1.2
- fixed URL parameters to only load QL forum posts
- fixed accumulating update timers

Version 1.1
- ensuring consistent order of tabs in the chat bar

Version 1.0
- first public release

*/

(function () {
  // external variables
  var quakelive = window.quakelive;
  var extraQL = window.extraQL;

  var URL_FORUM = "http://www.esreality.com/?a=post&forum=17";
  var UPDATE_INTERVAL = 60000;
  var updateTimeoutHandle;

  function init() {
    if (!extraQL.BASE_URL) {
      extraQL.echo("^1esreality^7 disabled: Not connected to extraQL server");
      return;
    }

    // delay init so that twitch, twitter, ESR and IRC scripts add items to chat menu bar in a defined order
    if (extraQL.hookVersion) // introduced at the same time as the addTabPage() "priority" param
      delayedInit();
    else
      setTimeout(delayedInit, 1600);
  }

  function delayedInit() {
    onContentLoaded();
    quakelive.AddHook("OnContentLoaded", onContentLoaded);
    quakelive.AddHook("OnGameModeEnded", updateForums);

    // the resizeLayout script's event handler will resize the <div> for us
    if (typeof (window.onresize) == "function")
      window.onresize();
  }

  function onContentLoaded() {
    if ($("#esreality").length)
      return;

    var fixedElementsHeight = 87;

    extraQL.addStyle(
      "#esreality { width: 300px; color: black; background-color: white; display: none; }",
      "#esrealityHeader { border-bottom: 1px solid #e8e8e8; padding: 9px 9px 8px 9px; }",
      "#esrealityHeader .headerText { font-size: 14px; font-weight: bold; line-height: 18px; }",
      "#esrealityHeader a { color: #A0220B; font-size: 14px; }",
      "#esrealityDetails { height: 32px; overflow: hidden; padding: 9px 6px; border-bottom: 1px solid #e8e8e8; }",
      "#esrealityContent { height: " + (550 - fixedElementsHeight) + "px; overflow: auto; }",
      "#esrealityContent div { padding: 3px 6px; max-height: 26px; overflow: hidden; }",
      "#esrealityContent .active { background-color: #ccc; }",
      "#esrealityContent a { color: black; text-decoration: none; }",
      "#esrealityContent a:hover { text-decoration: underline; }"
      );

    var content =
      "<div id='esreality' class='chatBox tabPage'>" +
      "  <div id='esrealityHeader'><span class='headerText'>esreality.com <a href='javascript:void(0)' id='esrealityShowForums' class='active'>Quake Live Forum</a></span></div>" +
      "  <div id='esrealityDetails'></div>" +
      "  <div id='esrealityContent' data-fill='" + fixedElementsHeight + "'></div>" +
      "</div>";
    extraQL.addTabPage("esreality", "ESR", content, undefined, 300);

    $("#esrealityShowForums").click(function () {
      $("#esrealityHeader a").removeClass("active");
      $(this).addClass("active");
      updateForums();
    });

    updateForums();
  }

  function updateForums() {
    if (quakelive.IsGameRunning())
      return;

    if (updateTimeoutHandle)
      window.clearTimeout(updateTimeoutHandle);

    $.ajax({
      url: extraQL.BASE_URL + "proxy",
      data: { url: URL_FORUM },
      dataType: "text"
    })
    .done(parseForum)
    .fail(function() { extraQL.log("Could not load esreality forum"); });

    updateTimeoutHandle = window.setTimeout(updateForums, UPDATE_INTERVAL);
  }

  function parseForum(html) {
    try {
      var $forum = $("#esrealityContent");
      $forum.empty();
      
      // update post list
      $(html).find(".pl_row").each(function (i, item) {
        var $row = $(item);
        var $this = $row.children(".pl_main");
        var $link = $this.children("span").children("a:first-child");
        var lastCommentTime = $this.children("div").text();
        var replies = $row.find(".pl_replies>div").text().trim();
        var author = $row.find(".pl_author>div>a").text();
        var descr = "Author: <b>" + extraQL.escapeHtml(author) + "</b>, Replies: " + replies + "<br/>" + lastCommentTime;
        $forum.append("<div" +
          " data-status='" + extraQL.escapeHtml(descr) + "'>" +
          "<a href='javascript:quakelive.OpenURL(\"http://www.esreality.com" + $link.attr("href") + "\")' target='_blank'>" +
          extraQL.escapeHtml($link.text()) +"</a></div>");
      });
      $("#esrealityContent div").hover(showForumDetails);

      showDetailsForFirstEntry();
    } catch (e) {
      extraQL.log(e);
    }
  }

  function showDetailsForFirstEntry() {
    var first = $("#esrealityContent>div")[0];
    if (!first) {
      $("#esrealityStatus").text("");
    } else {
      showForumDetails.apply(first);
      $(first).addClass("active");
    }
  }

  function showForumDetails() {
    var $this = $(this);
    $("#esrealityDetails").html($this.data("status"));
    $("#esrealityContent div").removeClass("active");
    $this.addClass("active");
  }


  init();
})();