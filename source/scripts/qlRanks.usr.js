// ==UserScript==
// @id             111519
// @name           QLRanks.com Display with Team Extension
// @version        2.10
// @description    Overlay quakelive.com with Elo data from QLRanks.com.  Use in-game too (/elo help, bind o "qlrdChangeOutput", bind r "qlrdAnnounce", bind k "qlrdDisplayGamesCompleted", bind l "qlrdShuffle" (if even number of players) )
// @namespace      phob.net
// @homepage       http://www.qlranks.com
// @screenshot     http://beham.biz/extraql/qlranks2.png
// @author         wn,szr,syncore,simonov,PredatH0r,ecs
// @contributor    szr
// @contributor    syncore
// @contributor    simonov
// @contributor    PredatH0r
// @contributor    ecs
// @unwrap
// ==/UserScript==

/*

Version 2.10
- changed "/elo shuffle!" so that it will make the minimum amount of moves and alternates moves between red and blue

Version 2.9
- show "Time Left" or "Time Elapsed" in server browser details

Version 2.8
- yet another attempt of fixing "/elo shuffle!" by increasing the delay between /put commands (also disabled putting everyone into spec first)

Version 2.7
- fixed backward compatibility with qlrdOutputMethod alias
- allow "table" format for output method "say"

Version 2.6
- another attempt at "/elo shuffle!" (put everyone into spec first to prevent exceeding teamsize while rearranging)
- added "/elo update" to clear qlranks player cache
- added "/elo say" as a shortcut for simple "say" output
- added "/elo table|list|simple" as a shortcut for formatted console output
- added info about badge letters to "/elo help"
- changed format=table to group teams in columns instead of lines
- added format=list
- lots of internal code cleanup (using localStorage instead of CVARs for storing user settings)

Version 2.5
- fixed "/elo shuffle!", where players are put into wrong teams. 
  This was caused by a race condition where extraQL read the condump file before it was updated with a delay by QL

Version 2.4
- fixed disabling badge letter (was printed black before)

Version 2.3
- allow an "x" as 3rd digit for /elo colors to disable the badge letter

Version 2.2
- output of "/elo shuffle" is now sorted by Elo

Version 2.1
- unified output format for /elo score and /elo shuffle
- added "/elo colors=nrb" to set colors for name, rating and badge letter. color 0 is used for team specific colors
- added info messages when in-game commands fail to get accurate team information from extraQL.exe

Version 2.0
- in-game commands now uses extraQL.exe to get accurate player/team info using /configstrings and /condump
  this fixes issues with "/elo score" and "/elo shuffle" using stale player lists

Version 1.109
- fixed displaying in-game score twice
- using the /elo sort=... setting now also for the output of the in-game command

Version 1.108
- added workaround to open external links in QL Steam build when using /elo profile=x

Version 1.107
- fixed error handling when ECS web service is unavailable

Version 1.106
- added workaround to open external links in QL Steam build

Version 1.105
- fixed "/elo shuffle!" printing "unknown cmd undefined" instead of putting players into teams
- "/elo games" now shows players with >= 10k games in a different color

Version 1.104
- show Team Elo gap in the color of the team that has the higher Elo
- no longer showing ??? as QLRanks score in match browser details for unsupported game types
- improved "/elo help" command

Version 1.103
- added /elo profile=x,y,... to open QLRanks profile of players x,y,... in your browser
  mix in "duel", "ca", "tdm" or "ffa" to set a game type for the next player names.
  default game type is the current server's or duel, if not connected to a server.
- added badge letter to /elo score indicating the number of games completed: A<100, B<200, ... J<1000, K<2000, L<3000, ...
- fixed formatting for red team average

Version 1.102
- /elo shuffle,+all,-player1 allows to add all players except player1 to the shuffle
- unified output format for /elo shuffle and /elo score (using team colors where applicable)
- format=list now also shows average and team Elo
- fixed "/elo shuffle!" assigning wrong players to teams

Version 1.101
- /elo shuffle now supports format=table and format=list
- /elo shuffle and /elo score output is now always formatted as list, when the output method is not set to "echo"

Version 1.100
- /elo shuffle now ignores specs, but allows overrides using /elo shuffle,+name1,-name2,...
- code cleanup, so there are no more warnings in VisualStudio 2013 with ReSharper
- minor bux fixes
- added @unwrap, so that javascript error messages show correct file name and line info (when cvar eql_unwrap=1)

Version 1.99
- fixed sorting of "/elo score" with format=list
- changed colors for format=table

Version 1.98
- fixed timing issue when delayed QLRanks data arrives and a different server has been selected in the meantime

Version 1.97
- fixed duplicated player rows

Version 1.96
- added average team elo to server browser details
- added /elo sort=x to set a sort criteria for the server browser detail list
- turning the "Join Match" button green, when average Elo is within +/- 150 of your own Elo

Version 1.94
- merged extraQL's code base with ecs' Team Extension codebase

Version 1.93
- the score in the match browser details is now a link that opens the QLranks.com player profile in your browser

Version 1.92
- fixed exception when page is filted for ANY game type

*/

/// *ecs* updated 060714, changed the shuffle algorithm to iterate n choose k permutations instead of a naive
/// *ecs* updated 140814 now using PredatH0r's modifications so that it works in the new design

/// team-oriented branch by ecs (average team elos etc)
/// * this version doesn't cache the results. if the script gets popular we might have to reinstate it to save qlranks bandwidth. 
///
/// use these commands in QuakeLive 
/// qlrdDisplayGamesCompleted show number of games completed in the game type
/// qlrdShuffle (for showing you a good shuffle, uses a naive random search, requires even number ppl)
/// qlrdShufflePerform (and perform the local shuffle if you are an admin) works if player slots are {0,1,...n-1} and dont skip, often the case
/// qlrdAnnounce (now color codes team membership and shows average team elos)
/// qlrdChangeOutput (as before)
/// issues: annoying chicken and egg thing on the team membership (red/blue) which screws up shuffle. The team membership is only 
/// shown correctly from the API after a long time has elapsed or the game has started, which defeats the object. It's
/// still useful for showing the optimal shuffle for the "next" game if nobody leaves or joins. 
///
/// I have implemented a JSON microsoft trueskill web service and was going to
/// add in predicted changes in elo, however on investigation it quickly became
/// clear that qlranks.com doesn't use trueskill, they probably use some arbitrary mechanism
/// I wonder what they use?
/// perhaps: http://jmlr.org/papers/volume12/weng11a/weng11a.pdf
/// or http://www.glicko.net/glicko/glicko2.pdf ??
/// I plan to scrape some training data from their site and train some kernel ridge regression or similar
/// to get some insight on their method

////////////////////////////////////////////////////////////////////////////////////////////////////
// RUN OR NOT
////////////////////////////////////////////////////////////////////////////////////////////////////

var quakelive = window.quakelive;
var qz_instance = window.qz_instance;
var console = window.console;
var document = window.document;
var localStorage = window.localStorage;
var mapdb = window.mapdb;
var extraQL = window.extraQL;

(function() {
  // Don't bother if Quake Live is down for maintenance
  if (/offline/i.test(document.title)) {
    return;
  }

  // Make sure we're on top
  if (window.self !== window.top) {
    return;
  }


////////////////////////////////////////////////////////////////////////////////////////////////////
// SETUP
////////////////////////////////////////////////////////////////////////////////////////////////////

  var DEBUG = false,
    DOLITTLE = function() {},
    logMsg = DEBUG ? function(aMsg) { console.log(aMsg); } : DOLITTLE,
    logError = function(aMsg) { console.log("ERROR: " + aMsg); },
    ELO_DIFF_FOR_GREEN_JOIN_BUTTON = 150,
    RE_profile = /profile\/summary\/(\w+)/i;



////////////////////////////////////////////////////////////////////////////////////////////////////
// PREFERENCES HELPER
////////////////////////////////////////////////////////////////////////////////////////////////////

  var PREFS = new Prefs();

  function Prefs() {
    this.debug = false;
    this.showRatingForAllGametypes = false;
    this.user_gt = "Duel";
    this.method = "echo";
    this.format = "table";
    this.sort = "team";
    this.colors = "007";

    /**
	  * Sets the local and stored value of a preference
	  * @param {String} the preference name
	  * @param {Boolean|Number|String} a value
	  * @return {Boolean|Number|String} the value passed as aVal
	  */
    this.set = function(aName, aVal) {
      this[aName] = aVal;
      localStorage["qlrd_" + aName] = aVal;
      return aVal;
    }

    // load saved preferences from local storage
    var self = this;
    $.each(this, function(name) {
      var val = localStorage["qlrd_" + name];
      if (val !== undefined) {
        self.set(name, val);
        logMsg("loaded pref '" + name + "' => '" + self[name] + "'");
      }
    });
  }


////////////////////////////////////////////////////////////////////////////////////////////////////
// QLRD RESOURCES/UTILITY
////////////////////////////////////////////////////////////////////////////////////////////////////

  var QLRD = initQlrd();
  
  function initQlrd() {
    var qlrd = {
      // Cache of player info (Elo, etc.)
      PLAYERS: {}

      // Keep track of each player's requests + targets
      ,
      fillReqs: {}

      // Map LGI (or other source) full name to the abbreviation used on QLRanks.com
      // TODO: fix this... currently just a catch-all for several things
      ,
      GAMETYPES: {
        "ca": "ca",
        "clan arena": "ca",
        "ctf": "ctf",
        "capture the flag": "ctf",
        "duel": "duel",
        "ffa": "ffa",
        "free for all": "ffa",
        "tdm": "tdm",
        "team deathmatch": "tdm",
        "team death match": "tdm" // used by the mapdb
      },
      OUTPUT: ["print", "echo", "say", "say_team"] // keep in sync with 'cvarDefaults' for in-game
      , FORMAT: ["table", "simple", "list" ]
      , SORT: ["ql", "elo", "team"]
      ,
      activeServerReq: false

      // Helper to echo and print a message
      ,
      igAnnounce: function(aMsg, aIsError) {
        if (!(aMsg && quakelive.IsGameRunning())) {
          return;
        }

        var msg = (aIsError ? "^1[QLRD]" : "^2[QLRD]") + " ^7" + aMsg + ";";
        qz_instance.SendGameCommand("echo " + msg);

        if (aIsError) {
          qz_instance.SendGameCommand("print " + msg);
          logError(aMsg);
        } else {
          logMsg(aMsg);
        }
      }

      /**
	   * Complete a request from cache, or initiate a new request
	   * @param {Array} an array of "set" object containing {name,targets?}
	   */,
      set: function(sets) {
        // Items to be requested from QLRanks.com
        var toRequest = [];

        if (!$.isArray(sets)) {
          sets = [sets];
        }
        logMsg("QLRD.set: got sets: " + JSON.stringify(sets));

        $.each(sets, function(i, s) {
          // Make sure the key is case-insensitive... wn = wN = WN
          try {
            s.name = $.trim(s.name.toLowerCase());
          } catch (e) {
            logError("QLRD.set: converting player name: " + e);
            return;
          }

          // Continue if the formatted name is empty
          if (!s.name.length) {
            return;
          }

          if ("targets" in s) {
            $.each(s.targets, function(gt, target) {
              var gtLow = gt.toLowerCase();

              // Make sure we're using a good gametype, otherwise remove the target.
              if (!(gtLow in QLRD.GAMETYPES)) {
                delete s.targets[gt];
                logError("QLRD.set: removing invalid gametype '" + gt
                  + "' for player '" + s.name + "'");
                return;
              }

              // The gametype key should always be lowercase to match QLRD.GAMETYPES
              if (gtLow != gt) {
                s.targets[gtLow] = $.trim(target.toLowerCase());
                delete s.targets[gt];
              }
            });
          } else {
            s.targets = {};
          }

          // Fulfill from the cache if possible
          if (s.name in QLRD.PLAYERS) {
            logMsg("QLRD.set: loading '" + s.name + "' from cache");
            $.each(s.targets, function(gt, target) {
              $(target).html(QLRD.PLAYERS[s.name][gt].elo)
                .attr("title", gt.toUpperCase() + " Rank: "
                  + QLRD.PLAYERS[s.name][gt].rank);
            });
          }
          // ... otherwise QLRanks.com
          else {
            logMsg("QLRD.set: requesting info for '" + s.name + "' from QLRanks.com");
            toRequest.push(s);
          }
        });

        // Pass uncached players to the userscript side
        if (toRequest.length) {
          doEloRequest(toRequest);
        }
      }

      /**
	   * Ensure all players are in the cache, then call the callback.
	   * @param {Array} an array of player objects (with a 'name' property)
	   * @param {String} the gametype, passed back to the callback
	   * @param {Function} a callback, sent either an error or players+gt
	   */,
      waitFor: function(players, gt, cb) {
        // Waiting 10 seconds for all players to get in the cache, polling every 50ms.
        var countdown = 200;

        // Send empty requests
        logMsg("QLRD.waitFor: setting: " + JSON.stringify(players));
        QLRD.set(players);

        // Wait until all players are in the cache or we've reached the maximum
        // number of tries.
        var checkForPlayers = window.setInterval(function(players, numPlayers) {
          for (var i = 0; i < numPlayers; ++i) {
            if (!(players[i].name in QLRD.PLAYERS)) {
              if (!--countdown) {
                // Fail.  Send back an error.
                logMsg("QLRD.waitFor: FAIL... couldn't get all players in cache");
                window.clearInterval(checkForPlayers);
                cb.call(null, true);
              }
              return;
            }
          }

          // Success.  Send back the player objects with Elo filled in for the gametype.
          logMsg("QLRD.waitFor: SUCCESS... all players are in cache");
          window.clearInterval(checkForPlayers);

          // Fill in the Elo+rank values for the current gametype.
          for (var i = 0, e = players.length; i < e; ++i) {
            var info = QLRD.PLAYERS[players[i].name][QLRD.GAMETYPES[gt]] || { elo: "", rank: "" };
            players[i]["elo"] = info.elo;
            players[i]["rank"] = info.rank;
          }

          cb.call(null, false, players, gt);
        }.bind(null, players, players.length), 50);
      }

      /**
	   * Handle result of {name,value}
	   */,
      handleMessage: function(response) {
        // Make sure we have everything
        if (!("name" in response && "value" in response)) {
          return;
        }

        if (!response.value) {
          logError("QLRD.handleMessage: got response missing value (" + response.value
            + ") for '" + response.name + "'");
          return;
        }

        // Don't cache if there was an error, just display the message.
        // TODO: combine the target stuff with QLRD.set somehow
        if (response.value["error"]) {
          if (response.targets) {
            $.each(response.targets, function(gt, target) {
              $(target).html(response.value["error"]);
            });
          }
        }
        // Update the local cache and target (if any) with our content.
        else {
          logMsg("QLRD.handleMessage: got response for '" + response.name + "': "
            + JSON.stringify(response.value));

          QLRD.PLAYERS[response.name] = response.value;

          if (!response.targets) return;

          $.each(response.targets, function(gt, target) {
            $(target).html(QLRD.PLAYERS[response.name][gt].elo)
              .attr("title", gt.toUpperCase() + " Rank: " + QLRD.PLAYERS[response.name][gt].rank);
          });
        }
      }
    }
    return qlrd;
  };


////////////////////////////////////////////////////////////////////////////////////////////////////
// ELO REQUEST HANDLING LOGIC
////////////////////////////////////////////////////////////////////////////////////////////////////

// Helper to fill in error messages when something goes wrong
  function fillError(aNames) {
    var response = {
      "type": "QLRD:eloResponse",
      "value": { "error": "error (see console)" }
    };

    // For each player from the failed request...
    for (var i = 0, e = aNames.length; i < e; ++i) {
      response.name = aNames[i];
      // ... if there are any fill requests
      if (aNames[i] in QLRD.fillReqs) {
        // ... fill them in with the error message
        for (var j = 0, k = QLRD.fillReqs[aNames[i]].length; j < k; ++j) {
          response.targets = QLRD.fillReqs[aNames[i]][j];
          QLRD.handleMessage(response);
        }

        // Needed so the next request will be sent to the API.  There is a
        // possibility that open fill requests will be lost, but that would
        // be a very rare and unlikely case.
        QLRD.fillReqs[aNames[i]] = [];
      } else {
        QLRD.handleMessage(response);
      }
    }
  }


/**
 * Handle Elo requests and generate a response
 * @param {Object} The message event.  Has data, origin, etc.
 * .data should be {type: "QLRD:eloRequest", reqs: [{name,targets?}]}
 */
  function doEloRequest(aReqs) {
    // Make sure we have an array of "set" objects
    if (!(aReqs && Array.isArray(aReqs))) {
      logError("doEloRequest: passed an invalid or non-Array 'aReqs': " + JSON.stringify(aReqs));
      return;
    }

    var response = {
      "type": "QLRD:eloResponse"
    };

    // Ensure all "set" objects have a valid name
    var namesToRequest = [];
    for (var i = 0, e = aReqs.length, name; i < e; ++i) {
      name = aReqs[i].name;
      if (/^\w+$/.test(name)) {
        QLRD.fillReqs[name] = QLRD.fillReqs[name] || [];
        QLRD.fillReqs[name].push(aReqs[i].targets);
        // Only send as part of the request if there were no previously open fill
        // requests for the player.
        if (1 == QLRD.fillReqs[name].length) {
          namesToRequest.push(name);
          continue;
        }
      }
      // Bad name...
      else {
        logError("doEloRequest: unable to use the player name at index " + i + ": '" + name + "'");
        delete aReqs[i];
        i--;
      }
    }

    if (0 == namesToRequest.length) {
      logError("doEloRequest: passed no valid names");
      return;
    }

    // Request the info from QLRanks.com
    logMsg("doEloRequest: requesting info for: '" + namesToRequest.join("','") + "'");

    $.ajax({
        type: "GET",
        url: "http://www.qlranks.com/api.aspx?nick=" + namesToRequest.join("+")
      })
      .done(function(aData) {
        logMsg("doEloRequest: got response for '" + namesToRequest.join("','") + "': " + JSON.stringify(aData));

        var players = aData.players;
        if (!players) {
          logError("doEloRequest: JSON for \"" + namesToRequest.join("','") + "\" was missing the 'players' member");
          fillError(namesToRequest);
          return;
        }

        // For each player in the response...
        for (var i = 0, e = players.length, nick, gts = ["ca", "ctf", "duel", "ffa", "tdm"]; i < e; ++i) {
          nick = players[i].nick;

          if (!(nick in QLRD.fillReqs || QLRD.fillReqs[nick].length)) {
            continue;
          }

          response.name = nick;

          // ... clean up the numbers
          for (var g = 0, h = gts.length; g < h; ++g) {
            players[i][gts[g]].elo = parseInt(players[i][gts[g]].elo);
            players[i][gts[g]].rank = parseInt(players[i][gts[g]].rank);
          }

          response.value = {
            "ca": players[i].ca,
            "ctf": players[i].ctf,
            "duel": players[i].duel,
            "ffa": players[i].ffa,
            "tdm": players[i].tdm
          };

          // ... send a message for each of the QLRD.fillReqs
          for (var j = 0, k = QLRD.fillReqs[nick].length; j < k; ++j) {
            response.targets = QLRD.fillReqs[nick][j];
            QLRD.handleMessage(response);
          }
          QLRD.fillReqs[nick] = [];
        }
      })
      .fail(function(jqXHR, textStatus) {
        logError("doEloRequest: the request failed for '" + namesToRequest.join("','") + "'\n" + textStatus);
        fillError(namesToRequest);
        return;
      });
  }


////////////////////////////////////////////////////////////////////////////////////////////////////
// AVERAGE TEAM ELO IN LIVE MATCH POPUP
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function installAverageTeamEloInLiveMatchPopup() {
    /**
     * Override BuildServerContent to show avg team Elo when applicable.
     */
    var oldBuildServerContent = quakelive.matchtip.BuildServerContent;
    quakelive.matchtip.BuildServerContent = function($tip, server) {
      var isNewTip = 0 == $tip.find("#lgi_host_name").length, $ret = oldBuildServerContent.call(quakelive.matchtip, $tip, server);

      // Only modify for the first call
      if (!isNewTip) {
        return $ret;
      }

      // Only show for supported team games
      if (!(server.game_type == mapdb.GameTypes.CA
        || server.game_type == mapdb.GameTypes.CTF
        || server.game_type == mapdb.GameTypes.TDM)) {
        return $ret;
      }

      // Add each player to the proper team roster to get the average Elo
      var gt = QLRD.GAMETYPES[server.GetGameTypeTitle().toLowerCase()],
        teams = { "red": [], "blue": [] },
        $redName = $ret.find(".lgi_scores_row > .lgi_name:contains('Red')"),
        $blueName = $ret.find(".lgi_scores_row > .lgi_name:contains('Blue')"),
        id = "qlr_team_avg_elo_" + Date.now();

      for (var i = 0, e = server.players.length; i < e; ++i) {
        // Red
        if (1 == server.players[i].team) {
          teams["red"].push({ "name": server.players[i].name });
        }
        // Blue
        else if (2 == server.players[i].team) {
          teams["blue"].push({ "name": server.players[i].name });
        }
      }

      // Add the placeholders
      $redName.append(" (<span id='" + id + "_r'>&hellip;</span>)");
      $blueName.append(" (<span id='" + id + "_b'>&hellip;</span>)");

      // Get the average Elo of the red team
      teams["red"].length && QLRD.waitFor(teams["red"], gt, function(aError, aPlayers) {
        if (aError) {
          logError("unable to get results for team red: " + JSON.stringify(aPlayers));
          return;
        }

        var avg = 0;
        if (aPlayers.length) {
          avg = Math.round(aPlayers.reduce(function(prev, cur) {
            return prev + cur.elo;
          }, 0) / aPlayers.length);
        }

        logMsg("average red Elo is: " + avg);
        $redName.find("#" + id + "_r").text(avg);
      });

      // Get the average Elo of the blue team
      teams["blue"].length && QLRD.waitFor(teams["blue"], gt, function(aError, aPlayers) {
        if (aError) {
          logError("unable to get results for team blue: " + JSON.stringify(aPlayers));
          return;
        }

        var avg = 0;
        if (aPlayers.length) {
          avg = Math.round(aPlayers.reduce(function(prev, cur) {
            return prev + cur.elo;
          }, 0) / aPlayers.length);
        }

        logMsg("average blue Elo is: " + avg);
        $blueName.find("#" + id + "_b").text(avg);
      });

      return $ret;
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// ELO IN LIVE MATCH POPUP PLAYER LIST
////////////////////////////////////////////////////////////////////////////////////////////////////
  (function modifyLiveMatchPopup() {
    /**
     * Create our own lgi_cli ("player list") to add the Elo column.
     * This does the following:
     *   - widens lgi_cli_ stuff to contain Elo column
     *   - NOTE: the above is commented out... On <-> Off caused a spacing issue
     *   - redesigns the lgi_cli_ stuff, since the old images were a fixed size
     *   - sets the Elo column to the old "Scores" position
     *   - sets the old "Scores" column (number 2) to a new third column position
     */
    extraQL.addStyle(
      "#lgi_cli { display: none; }",
      "#lgi_cli_top, #lgi_cli_fill, #lgi_cli_bot { width: 280px; background: #232323; border-left: 1px solid #ccc; border-right: 1px solid #ccc; }",
      "#lgi_cli.elo #lgi_cli_top, #lgi_cli.elo #lgi_cli_fill, #lgi_cli.elo #lgi_cli_bot { width: 280px; margin-right: 4px; }", // original 236, +50 for elo, orig contained 4px transparent spacer
      "#lgi_cli_top { border-radius: 3px 3px 0 0; border-top: 1px solid #ccc; }",
      "#lgi_cli_bot { height: 5px; border-bottom: 1px solid #ccc; border-radius: 0 0 3px 3px; }",
      "#lgi_cli_content { width: 262px; }",
      "#lgi_cli.elo #lgi_cli_content { width: 262px; }", // 212 + 50
      ".lgi_headcol_elo, .lgi_cli_col_elo { display: none; }",
      "#lgi_cli.elo .lgi_headcol_elo { display: inline; left: 165px; position: absolute; text-align: center; width: 50px; }",
      "#lgi_cli.elo .lgi_cli_col_elo { display: inline; height: 20px; left: 157px; overflow: hidden; position: absolute; text-align: center; width: 50px; }",
      "#lgi_cli.elo .lgi_is_friend a { color: #ffcc00; }",
      ".lgi_headcol_2 { left: 165px; }",
      "#lgi_cli.elo .lgi_headcol_2 { left: 215px; }", // 165 + 50
      ".lgi_cli_col_2 { left: 157px; }",
      "#lgi_cli.elo .lgi_cli_col_2 { left: 207px; }" // 157 + 50
    );


// Remove any existing lgi_cli
    $("#lgi_cli").remove();

// Add the new lgi_cli with our Elo column
    $("body").append(
      "<div id='lgi_cli'>"
      + "<div id='lgi_cli_top'>"
      + "<div class='lgi_headcol_1'>Player Name</div>"
      + "<div class='lgi_headcol_elo'>QLR Elo</div>"
      + "<div class='lgi_headcol_2'>Score</div>"
      + "</div>"
      + "<div id='lgi_cli_fill'>" + "<div id='lgi_cli_content'></div>" + "</div>"
      + "<div id='lgi_cli_bot'>" + "</div>"
      + "</div>"
    );


  /**
   * Called before #lgi_cli (the player list) is displayed.
   */
    $("#lgi_cli").on("beforeShow", function() {
      var $this = $(this),
        gt = $("#lgi_match_gametype span").text().trim().toLowerCase(),
        isSupported = gt in QLRD.GAMETYPES,
        showForAll = PREFS.showRatingForAllGametypes,
        $scoreCols = $this.find(".lgi_cli_col_2");

      // Currently only showing Elo for supported gametypes
      // unless forced by the "showRatingForAllGametypes" preference.
      // TODO: the next line is causing #lgi_cli to hide for unsupported game modes... need to fix
      //$this.toggleClass("elo", isSupported || showForAll);
      $this.addClass("elo");

      if (!isSupported) {
        if (showForAll) {
          gt = "duel";
        } else {
          return;
        }
      }

      gt = QLRD.GAMETYPES[gt];

      // For every player...
      var sets = [];

      $this.find(".lgi_cli_col_1 span").each(function(i) {
        var name = $(this).text(), player = name.substring(name.lastIndexOf(" ") + 1);

        // Add the Elo cell
        $scoreCols.eq(i).before("<div class='lgi_cli_col_elo'>"
          + "<a id='lgi_cli_elo_" + player + "' href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/"
          + gt + "/player/" + player
          + "\")' target='_blank'>&hellip;</a></div>");

        // Request the Elo rating of the player
        var s = { "name": player, "targets": {} };
        s["targets"][gt] = "#lgi_cli_elo_" + player;
        sets.push(s);
      });

      // QL compiled.js assumes fixed with for positioning, which is off by the added Elo column width
      var $cli = $("#lgi_cli");
      $cli.css("left", (parseInt($cli.css("left")) - 50) + "px");

      // Send the request
      QLRD.set(sets);
    });


  /**
   * Override jQuery's show() so we can intercept interesting things before and after it runs
   * @param {String} the speed at which to show the element
   * @param {String} an optional callback for after the element in shown
   */
    var oldShow = $.fn.show;
    $.fn.show = function(aSpeed, aCallback) {
      return $(this).each(function() {
        var $this = $(this);
        var newCallback = function() {
          if ($.isFunction(aCallback)) {
            aCallback.apply($this);
          }
          $this.trigger("afterShow");
        };
        $this.trigger("beforeShow");
        oldShow.apply($this, [aSpeed, newCallback]);
      });
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// PROFILE PAGE ELO BAR
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function modifyProfilePageEloBar() {
    // Set up the styling for the profile module's Elo rating div
    extraQL.addStyle(
      "#qlr_elo { margin: 0 auto 5px; background-color: #232323; color: #fff; }",
      "#qlr_elo div { display: inline-block; width: 100px; padding: 3px; text-align: center; }",
      "#qlr_elo div:first-child { width: 130px; border-right: 1px solid #fff; }",
      "#qlr_elo div:nth-child(odd) { background-color: #333; }",
      "#qlr_elo div a { display: inline-block; width: 100%; text-decoration: none; }",
      "#qlr_elo div span { font-style: italic; font-weight: bold; }"
    );


    /**
     * Override profile's ShowContent to show the Elo bar
     * @param {String} aCon The content passed to the module to display
     */
    var oldShowContent = quakelive.mod_profile.ShowContent;
    quakelive.mod_profile.ShowContent = function QLR_mod_profile_ShowContent(aCon) {
      // The name should be the third part of the path.
      var name = quakelive.pathParts[2] || "";

      // Prepend the Elo rating div so we don't get an annoying FoC.
      var con = "<div id='qlr_elo'>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/duel/player/" + name + "\")' target='_blank'>QLRanks.com Elo</a></div>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/duel/player/" + name + "\")' target='_blank'>Duel: <span id='qlr_elo_duel'>loading&hellip;</span></a></div>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/tdm/player/" + name + "\")' target='_blank'>TDM: <span id='qlr_elo_tdm'>loading&hellip;</span></a></div>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/ctf/player/" + name + "\")' target='_blank'>CTF: <span id='qlr_elo_ctf'>loading&hellip;</span></a></div>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/ca/player/" + name + "\")' target='_blank'>CA: <span id='qlr_elo_ca'>loading&hellip;</span></a></div>"
        + "<div><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/ffa/player/" + name + "\")' target='_blank'>FFA: <span id='qlr_elo_ffa'>loading&hellip;</span></a></div>"
        + "</div>"
        + aCon;

      // Show the modified profile page.
      oldShowContent.call(quakelive.mod_profile, con);

      // Fill in the value.
      QLRD.set({
        "name": name,
        "targets": {
          "duel": "#qlr_elo_duel",
          "tdm": "#qlr_elo_tdm",
          "ctf": "#qlr_elo_ctf",
          "ca": "#qlr_elo_ca",
          "ffa": "#qlr_elo_ffa"
        }
      });
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// CURRENT PLAYER ELO IN UPPER-RIGHT
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function modifyLogoArea() {
    /**
     * Show the signed-in player's Elo rating in the upper-right info section.
     * Set on an interval since the target isn't immediately available.
     */
    var $st,
      $pcn,
      intStatusTop,
      tries = 200 // ~20 seconds
      ;

    intStatusTop = window.setInterval(initLogoAreaElo, 100);

    // sometimes after playing some matches the QLRanks info in the logo area disappears
    quakelive.AddHook("OnContentLoaded", injectLogoAreaEloHtml);

    function initLogoAreaElo() {
      $st = $("#qlv_statusTop");
      $pcn = $st.find("a.player_clan_name");

      if (--tries && !$pcn.length) {
        return;
      }

      window.clearInterval(intStatusTop);
      intStatusTop = null;

      // Styling
      extraQL.addStyle(
        "#qlv_user_data_elo_gametype { cursor: pointer; border-bottom: 1px dotted; }",
        "#qlv_user_data_elo_gametype_menu { display: none; }",
        "#qlv_user_data_elo_gametype_menu span { cursor: pointer; margin-right: 10px; }",
        "#qlv_user_data_elo_gametype_menu span.selected { border-bottom: 1px dotted; }"
      );

      injectLogoAreaEloHtml();
    }

    function injectLogoAreaEloHtml() {
      if ($("#qlv_user_data_elo_gametype").length)
        return;

      $st = $("#qlv_statusTop");
      $pcn = $st.find("a.player_clan_name");
      if ($pcn.length == 0)
        return;

      // Inject...
      $pcn.before("<span id='qlv_user_data_elo_gametype' title='Click to change QLRanks.com Elo gametype'>" + PREFS.user_gt + "</span>"
        + "<div id='qlv_user_data_elo_gametype_menu'>"
        + "<span>CA</span><span>CTF</span><span>Duel</span><span>FFA</span><span>TDM</span></div>: "
        + "<a id='qlv_user_data_elo' href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/" + PREFS.user_gt.toLowerCase() + "/player/"
        + quakelive.username + "\")' target='_blank'>&hellip;</a>"
        + "<div class='cl' style='margin-bottom: 5px'></div>");

      // ... and get the Elo rating
      var s = { "name": quakelive.username, "targets": {} };
      s["targets"][PREFS.user_gt] = "#qlv_user_data_elo";
      QLRD.set(s);

      // Set up the toggle
      $("#qlv_user_data_elo_gametype").on("click", function() {
        $(this).hide();
        $("#qlv_user_data_elo_gametype_menu").css("display", "inline-block").show().focus();
      });

      $("#qlv_user_data_elo_gametype_menu").on("click", "span", function() {
          var $this = $(this), new_gt = $this.text();

          // Hide the options
          $this.parent().hide();

          // Clear the selected class from siblings, and set on this
          $this.siblings("span.selected").removeClass("selected");
          $this.addClass("selected");

          // Update from the clicked gametype
          $("#qlv_user_data_elo_gametype").text(new_gt).show();

          // Do nothing more if the gametype didn't change
          if (new_gt == PREFS.user_gt) {
            logMsg("ignoring identical 'user_gt': " + new_gt);
            return;
          }

          // Update the URL
          $("#qlv_user_data_elo").attr("href",
            "javascript:quakelive.OpenURL(\"http://www.qlranks.com/" + new_gt.toLowerCase() + "/player/" + quakelive.username + "\")");

          // Show the appropriate Elo #
          var s = { "name": quakelive.username, "targets": {} };
          s["targets"][new_gt] = "#qlv_user_data_elo";
          QLRD.set(s);

          // Update the script's user_gt preference
          logMsg("change pref 'user_gt' from '" + PREFS.user_gt + "' to '" + new_gt + "'");
          PREFS.set("user_gt", new_gt);
        })
        .find("span:contains('" + PREFS.user_gt + "')").addClass("selected");
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// ELO IN POSTGAME MATCH STATS POPUP
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function modifyPostGameMatchStats() {
    // Set up styling for the versus frame's Elo rating links
    extraQL.addStyle(
      "#match_vscontainer_elo1, #match_vscontainer_elo2 { position: absolute; z-index: 11; top: 70px; }",
      "#match_vscontainer_elo1 { left: 32px; }",
      "#match_vscontainer_elo2 { right: 33px; }",
      "#match_vscontainer_elo1 a, #match_vscontainer_elo2 a { text-decoration: none; }",
      "#match_vscontainer_elo1 a:hover, #match_vscontainer_elo2 a:hover { text-decoration: underline; }"
    );


    /**
     * Override statstip's DisplayStatsTooltip and GetVersusFrame to fill in Elo data
     */
    var oldGetVersusFrame = quakelive.statstip.GetVersusFrame;
    quakelive.statstip.GetVersusFrame = function(gameType, player1, player2, team1, team2) {
      var $mvs = oldGetVersusFrame.call(quakelive.statstip, gameType, player1, player2, team1, team2), gameType = gameType.toLowerCase();

      // For Duel...
      if ("duel" == gameType) {
        player1 = player1.PLAYER_NICK;
        player2 = player2.PLAYER_NICK;

        // Player 1 (left side)
        $mvs.find(".flagNum1")
          .after("<div id='match_vscontainer_elo1'>"
            + "<a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/duel/player/" + player1
            + "\")' target='_blank'>&hellip;</a></div>");

        // Player 2 (right side)
        $mvs.find(".flagNum2")
          .before("<div id='match_vscontainer_elo2'>"
            + "<a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/duel/player/" + player2
            + "\")' target='_blank'>&hellip;</a></div>");

        // Wait a bit so the versus frame gets inserted.
        window.setTimeout(function() {
          var s1 = { "name": player1, "targets": {} };
          s1["targets"]["duel"] = "#match_vscontainer_elo1 a";

          var s2 = { "name": player2, "targets": {} };
          s2["targets"]["duel"] = "#match_vscontainer_elo2 a";

          QLRD.set([s1, s2]);
        }, 0);
      }

      // Return the modified content to be appended
      return $mvs;
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// IN-GAME ELO
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function inGameCommands() {
    var aliasDefaults = {
      "qlrdDisplayGamesCompleted": "seta _gamescomp 0; seta _gamescomp 1;",
      "qlrdShuffle": "seta _qlrd_shuffle 0; seta _qlrd_shuffle 1;",
      "qlrdShufflePerform": "seta _qlrd_shuffle_perform 0; seta _qlrd_shuffle_perform 1;",
      "qlrdAnnounce": "seta _qlrd_announce 0; seta _qlrd_announce 1;",
      "qlrdChangeOutput": "vstr _qlrd_output" 
    }

    // NOTE: users may have bound "vstr _qlrd_output" to a key instead of the "qlrdChangeOutput" alias, so we keep this cvar for backward compatibility
    quakelive.cvars.Set("_qlrd_output", "\"seta _qlrd_cycleOutputMethod 0; seta _qlrd_cycleOutputMethod 1;\"");

    // always set the aliases
    $.each(aliasDefaults, function(alias, def) {
      qz_instance.SendGameCommand("alias " + alias + " \"" + def + "\"");
    });

    /**
     * Override OnCvarChanged to track our in-game commands
     */
    var CMD_NAME = "elo";
    var CMD_USAGE = "Use ^1/" + CMD_NAME + " help^7 for help";
    qz_instance.SendGameCommand("set " + CMD_NAME + " \"" + CMD_USAGE + "\"");

    var oldOnCvarChanged = window.OnCvarChanged;
    window.OnCvarChanged = function(name, val, replicate) {
      switch (name) {
        case CMD_NAME:
          handleQlrdCommand(val);
          break;

        case "_qlrd_cycleOutputMethod":
          if (val == "1")
            cycleOutputMethod();
          break;

        case "_qlrd_outputMethod":
          if (QLRD.OUTPUT.indexOf(val) >= 0)
            PREFS.set("method", val);
          break;

        case "_qlrd_announce":
          if (val == "1") {
            announce(PREFS.method, PREFS.format);
            if (PREFS.method == "echo")
              qz_instance.SendGameCommand("print ^2QLRD: ^7QLRanks information was written to your console");
          }
          break;

        case "_gamescomp":
          if (val == "1")
            games(val);
          break;

        case "_qlrd_shuffle":
        case "_qlrd_shuffle_perform":
          if (val == "1")
            shuffle(val, name == "_qlrd_shuffle_perform");
          break;
      }
      oldOnCvarChanged.call(null, name, val, replicate);
    }

    function handleQlrdCommand(val) {
      if (val == "" || val == CMD_USAGE)
        return;
      qz_instance.SendGameCommand("set " + CMD_NAME + " \"" + CMD_USAGE + "\"");

      if (val == "help")
        showHelp();
      else if (val == "update")
        clearEloCache();
      else if (val == "score")
        announce(PREFS.method, PREFS.format);
      else if (val == "say")
        announce("say", PREFS.format);
      else if (val == "table" || val == "list" || val == "simple")
        announce("echo", val);
      else if (RegExp("^method(=.*)?$").test(val))
        printOrSetPref("method", val.substr(7), QLRD.OUTPUT);
      else if (RegExp("^format(=.*)?$").test(val))
        printOrSetPref("format", val.substr(7), QLRD.FORMAT, "^5Note:^7 Formatting is only customizable for ^3method=echo^7. All other methods use ^3format=simple^7.");
      else if (RegExp("^sort(=.*)?$").test(val))
        printOrSetPref("sort", val.substr(5), QLRD.SORT);
      else if (RegExp("^colors(=.*)?$").test(val))
        printOrSetColors(val.substr(7));
      else if (val.indexOf("profile=") == 0)
        showQlranksProfile(val.substr(8, val.length - 8));
      else if (val == "games")
        games("1");
      else if (val.indexOf("shuffle!") == 0)
        shuffle("1", true, val.substr(8));
      else if (val.indexOf("shuffle") == 0)
        shuffle("1", false, val.substr(7));
      else
        qz_instance.SendGameCommand("echo " + CMD_USAGE);
    }

    function showHelp() {
      qz_instance.SendGameCommand("echo Usage: ^5/" + CMD_NAME + "^7 <^3command^7>");
      qz_instance.SendGameCommand("echo \"^3say^7       shows the QLRanks score to all players\"");
      qz_instance.SendGameCommand("echo \"^3table^7|^3list^7|^3simple^7           ^^^7... formatted in your console\"");
      qz_instance.SendGameCommand("echo \"^3method^7=x  show/set output method\"");
      qz_instance.SendGameCommand("echo \"^3format^7=x  show/set output format used by method=echo\"");
      qz_instance.SendGameCommand("echo \"^3sort^7=x    show/set sorting\"");
      qz_instance.SendGameCommand("echo \"^3colors^7=x  show/set color digits for player,score,badge\"");
      qz_instance.SendGameCommand("echo \"^3score^7     shows the QLRanks score using above settings\"");
      qz_instance.SendGameCommand("echo \"^3games^7     shows the number of completed games for each player\"");
      qz_instance.SendGameCommand("echo \"^3shuffle^7!  suggest/arrange teams based on QLRanks score\"");
      qz_instance.SendGameCommand("echo \"          append ^3,+all,+player1,-player2^7 to add/remove players\"");
      qz_instance.SendGameCommand("echo \"^3profile=^7x opens QLranks.com player profile in your browser\"");
      qz_instance.SendGameCommand("echo \"          ^3x^7 is a comma separated list of game types and players\"");
      qz_instance.SendGameCommand("echo \"^3update^7    clears cached QLRanks Elo scores\"");
      qz_instance.SendGameCommand("echo \"\"");
      qz_instance.SendGameCommand("echo \"Badge letters after Elo score indicate number of games completed\"");
      qz_instance.SendGameCommand("echo ^3A-J^7:  <100...<1000, ^3K-Y^7: <2000...<16000, ^3Z^7: >=16000");
    }

    function clearEloCache() {
      QLRD.PLAYERS = {};
      logMsg("Player data cache cleared");
    }

    function printOrSetPref(prefName, newValue, allowedValues, extraHelp) {
      if (newValue == undefined || newValue == "") {
        extraQL.echo("Current ^3" + prefName + "^7 is: ^5" + PREFS[prefName] + "^7. Allowed: ^5" + allowedValues.join("^7,^5"));
        if (extraHelp)
          extraQL.echo(extraHelp);
      } else if (allowedValues.indexOf(newValue) >= 0) {
        PREFS.set(prefName, newValue);
      } else
        extraQL.echo("^1Invalid " + prefName + ".^7 Allowed: ^5" + allowedValues.join("^7,^5"));
    }

    function printOrSetColors(newValue) {
      function colorInfo(digit) { return (digit >= "1" && digit <= "7" ? "^" + digit : "^5") + digit; }

      if (newValue == undefined || newValue == "") {
        var colors = PREFS.colors;
        qz_instance.SendGameCommand("echo Current value is: " + colorInfo(colors[0]) + colorInfo(colors[1]) + colorInfo(colors[2]) + "^7. Allowed: 3 digits for ^5player name^7, ^5score^7, ^5badge^7");
        qz_instance.SendGameCommand("echo Valid digits are ^50^7=team color (^5player^7, ^1red^7, ^4blue^7, spec), ^11 ^22 ^33 ^44 ^55 ^66 ^77");
        qz_instance.SendGameCommand("echo Use ^5x^7 as 3rd digit to disable badge letters");
      } else if (RegExp("^[0-7][0-7][0-7Xx]$").test(newValue))
        PREFS.set("colors", newValue);
      else
        qz_instance.SendGameCommand("echo ^1Invalid value.^7 Use ^5/elo colors^7 for help");
    }

    function cycleOutputMethod() {
      var currentMethodIndex = QLRD.OUTPUT.indexOf(PREFS.method);
      PREFS.set("method", QLRD.OUTPUT[(currentMethodIndex + 1) % QLRD.OUTPUT.length]);
      qz_instance.SendGameCommand("print ^2QLRD: ^7Output method is now ^5" + PREFS.method + "^7.");
    }

    function announce(method, format) {
      var announceServer = null;
      var announceGametype = null;
      var announceQlrPlayers = null;
      var announceEcsGamesPlayed = null;
      var announceComplete = false;

      if (!quakelive.IsGameRunning()) {
        return;
      }

      // Give the request some time to complete
      if (QLRD.activeServerReq) {
        QLRD.igAnnounce("Please wait for the current request to complete...", false);
        return;
      }

      QLRD.activeServerReq = true;

      // Refresh the current server's details
      refreshServerDetails(
        function(server) {

          // Stop if no players were returned
          if (0 == server.players.length) {
            QLRD.igAnnounce("No players were returned by Quake Live.  "
              + "Please try again in a few seconds.", true);
            QLRD.activeServerReq = false;
            return;
          }

          // Make sure we're using a gametype tracked by QLRanks
          var gt;
          try {
            gt = mapdb.getGameTypeByID(server.game_type).title.toLowerCase();
          } catch (e) {
            QLRD.igAnnounce("Unable to determine server gametype. " + e, true);
            QLRD.activeServerReq = false;
            return;
          }
          if (!(gt in QLRD.GAMETYPES)) {
            QLRD.igAnnounce(gt.toUpperCase() + " is not currently tracked by QLRanks.", true);
            QLRD.activeServerReq = false;
            return;
          }

          QLRD.igAnnounce("Collecting QLRanks.com and ECS data (" + server.players.length + " players)...", false);

          // Wait for all server players to be available in the QLRD cache.
          announceServer = server;
          announceGametype = gt;
          var names = $.map(server.players, function(p) { return { "name": p.name } });

          var showBadge = PREFS.colors[2].toUpperCase() != "X";
          if (showBadge) {
            QLRD.waitFor(names, gt, announceQlrDataArrived);

            var just_names = $.map(server.players, function(p) { return p.name; });
            $.ajax({
              url: "http://qlranks20917.azurewebsites.net/api/Stats/GetProfileGametypesFinished",
              data: { profile: just_names.join(",") },
              dataType: "json",
              success: announceEcsDataArrived,
              timeout: 4500
            });
          } else
            QLRD.waitFor(names, gt, announceAllDataAvailable);
        }, true
      );

      var announceTimeout = null;

      function announceQlrDataArrived(error, players) {
        // Always clear the active request flag.
        QLRD.activeServerReq = false;

        // Stop if something went wrong.
        if (error) {
          QLRD.igAnnounce("Unable to retrieve QLRanks.com data.", true);
          return;
        }

        announceQlrPlayers = players;
        if (announceEcsGamesPlayed)
          announceAllDataAvailable();
        else
          window.setTimeout(announceAllDataAvailable, 5000);
      }

      function announceEcsDataArrived(data) {
        var games_played = {};
        $.each(data, function(i, p) {
          games_played[p["ProfileName"]] = parseInt(p[QLRD.GAMETYPES[announceGametype].toUpperCase()]);
        });

        announceEcsGamesPlayed = games_played;
        if (announceQlrPlayers)
          announceAllDataAvailable();
      }

      function announceAllDataAvailable() {
        if (announceTimeout) {
          window.clearTimeout(announceTimeout);
          announceTimeout = null;
        }

        if (announceComplete)
          return;
        announceComplete = true;

        function getQlmEloByName(players, name) {
          for (var p = 0; p < players.length; p++) {
            if (players[p].name == name)
              return parseInt(players[p].elo);
          }
          return -1;
        }

        var players_copy = $.map(announceServer.players, function(p) {
          var games = announceEcsGamesPlayed ? parseInt(announceEcsGamesPlayed[p.name]) : NaN;
          return {
            "name": p.name,
            "team": p.team,
            "elo": getQlmEloByName(announceQlrPlayers, p.name),
            "badge": isNaN(games) ? "" : games >= 16000 ? "Z" : games < 1000 ? String.fromCharCode(65 + Math.floor(games / 100)) : String.fromCharCode(74 + Math.floor(games / 1000))
          }
        });

        // Sort players by either Elo or team
        var sortStyle = getSortStyle() || "team";
        players_copy.sort(sortPlayerFunc(sortStyle));

        displayPlayers(players_copy, "Current", method, format);
      }
    }

    function displayPlayers(players, verb, method, format) {
      // Display the results.
      // NOTE: mul is "1" to separate the header from the results
      if (!method)
        method = PREFS.method;
      if (!format)
        format = PREFS.format;

      // Show the chat pane for 10 seconds if output method is 'print',
      // otherwise it will be difficult to notice.
      if ("print" == method) {
        qz_instance.SendGameCommand("+chat;");
        window.setTimeout(function() {
          qz_instance.SendGameCommand("-chat;");
        }, 10E3);
      }

      // display team stats
      var stats = calcStats(players);
      var hasTeams = stats.redcount > 0 || stats.blucount > 0;
      var avgInfo = hasTeams ?
        verb + " teams: " + stats.teamSummary + " ^7Avg: " + stats.allavg + "(" + stats.allcount + ")" :
        "^3Avg rating: " + stats.allavg + "(" + stats.allcount + ")";
      qz_instance.SendGameCommand(method + "\"" + avgInfo + "\"");

      // generate output lines
      if (!(method == "echo" || (method == "say" && format != "table")))
        format = "simple";
      var lines = format == "table" ? getTableLines(players, hasTeams, method) : getSequentialLines(players, format);

      // print output lines
      var mul = 1, step = $.inArray(method, ["echo", "print"]) > -1 ? 100 : 1000;
      $.each(lines, function(i, line) {
        window.setTimeout(function(txt) {
          qz_instance.SendGameCommand(method + " \"" + txt + "\";");
        }.bind(null, line), mul++ * step);
      });

      function getSequentialLines(players, format) {
        var colors = PREFS.colors;
        var prefixLine = colors[0] != "0" && colors[1] != "0";
        var prevTeam = players[0].team;
        var teamMemberCount = 0;
        var playersPerLine = format == "list" ? 1 : 4;
        var columnSep = format == "list" ? "" : "^7, ";
        var lines = [];
        for (var i = 0, out = [], len = players.length; i <= len; ++i) {
          var curTeam = i == len ? prevTeam : players[i].team;
          if (curTeam != prevTeam || i == len || (teamMemberCount && teamMemberCount % playersPerLine == 0)) {
            var linePrefix = prefixLine ? getTeamColor(prevTeam) + "PRBS"[prevTeam] + ": ^7" : "";
            var line = linePrefix + out.join(columnSep);
            lines.push(line);
            out = [];
          }
          if (i == len)
            break;
          teamMemberCount = curTeam == prevTeam ? teamMemberCount + 1 : 1;
          prevTeam = curTeam;

          var nameColor = colors[0] == "0" ? getTeamColor(curTeam) : "^" + colors[0];
          var scoreColor = colors[1] == "0" ? getTeamColor(curTeam) : "^" + colors[1];
          var badge = colors[2].toUpperCase() != "X" && players[i].badge ? "^" + colors[2] + players[i].badge : "";
          if (format == "list")
            out.push(nameColor + pad(players[i].name, 10).substr(0, 10) + " " + scoreColor + pad(players[i].elo, -4) + badge);
          else
            out.push(nameColor + players[i].name + " " + scoreColor + players[i].elo + badge);
        }
        return lines;
      }

      function getTableLines(players, hasTeams, method) {
        var playersColumns = [[], [], []];
        if (hasTeams) {
          $.each(players, function(i, p) {
            playersColumns[p.team == 1 || p.team == 2 ? p.team - 1: 2].push(p);
          });
        } else {
          var playerCount = players.reduce(function (count, p) { return p.team == 0 ? count + 1 : count; }, 0);
          var nonplayerCount = players.length - playerCount;
          var playerSlots = Math.max(Math.floor((playerCount + 1) / 2), nonplayerCount);
          $.each(players, function (i, p) {            
            playersColumns[p.team == 0 ? (playersColumns[0].length < playerSlots ? 0 : 1) : 2].push(p);
          });
        }

        var colors = PREFS.colors;
        var showBadge = colors[2].toLowerCase() != "x" ? 1 : 0;
        var nameWidth = method == "say" ? 12 : 14;
        var lines = [];
        for (var i = 0; i < 16; i++) {
          var line = "";
          var hasInfo = false;
          for (var c = 0; c < 3; c++) {
            var separator = c < 2 ? (method == "say" ? "^7|"  : "^7 | ") : "";
            if (playersColumns[c].length > i) {
              hasInfo = true;
              var p = playersColumns[c][i];
              var teamColor = getTeamColor(p.team);
              var nameColor = colors[0] == "0" ? teamColor : "^" + colors[0];
              var scoreColor = colors[1] == "0" ? teamColor : "^" + colors[1];
              var badgeColor = colors[2] == "0" ? teamColor : "^" + colors[2];

              line += nameColor + pad(p.name, nameWidth).substr(0, nameWidth) + scoreColor + pad(p.elo, -4);
              if (showBadge)
                line += badgeColor + (p.badge || " ");
              line += separator;
            } else
              line += pad("", nameWidth + 4 + showBadge) + separator;
          }

          if (hasInfo)
            lines.push(line);
          else
            break;
        }
        return lines;
      }
    }

    function refreshServerDetails(callback, allowFallback) {
      function fallback(msg, callback) {
        if (allowFallback) {
          QLRD.igAnnounce(msg + " Using stale player information from quakelive.com instead");
          refreshServerDetailsFromQlApi(callback);
        } else {
          QLRD.igAnnounce(msg + " Action aborted.", true);
        }
      }

      if (extraQL.isLocalServerRunning()) {
        qz_instance.SendGameCommand("echo ]\\configstrings"); // text marker required by extraQL servlet
        qz_instance.SendGameCommand("configstrings");
        qz_instance.SendGameCommand("condump extraql_condump.txt");
        // QL writes the condump delayed, so the servlet must handle this race condition 
        $.getJSON(extraQL.BASE_URL + "serverinfo")
          .done(function(json) {
            if (json.error) {
              fallback(json.error, callback);
              return;
            }
            var server = { condump: true, game_type: json.gameinfo.g_gametype, players: [] };
            $.each(json.players, function(i, obj) {
              server.players.push({ "name": obj.n.toLowerCase(), "team": obj.t, "clientid": obj.clientid });
            });
            callback(server);
          })
          .fail(function() {
            fallback("Failed to call extraQL.exe", callback);
          });
      } else {
        fallback("extraQL.exe not running.", callback);
      }
    }

    function refreshServerDetailsFromQlApi(callback) {
      quakelive.serverManager.RefreshServerDetails(quakelive.currentServerId, {
        // Force a new request
        cacheTime: -1,
        onSuccess: function() {
          var server = quakelive.serverManager.GetServerInfo(quakelive.currentServerId);
          callback(server);
        },
        onError: function() {
          QLRD.igAnnounce("Unable to update current server info.", true);
          QLRD.activeServerReq = false;
        }
      });
    }

    function games(val) {
      if (1 !== parseInt(val) || !quakelive.IsGameRunning()) {
        return;
      }

      var currentOut = PREFS.method;

      QLRD.activeServerReq = true;

      // Refresh the current server's details
      refreshServerDetails(function(server) {
        // Stop if no players were returned
        if (0 == server.players.length) {
          QLRD.igAnnounce("No players were returned by Quake Live.  "
            + "Please try again in a few seconds.", true);
          QLRD.activeServerReq = false;
          return;
        }

        // Make sure we're using a gametype tracked by QLRanks
        var gt;
        try {
          gt = mapdb.getGameTypeByID(server.game_type).title.toLowerCase();
        } catch (e) {
          QLRD.igAnnounce("Unable to determine server gametype. " + e, true);
          QLRD.activeServerReq = false;
          return;
        }
        if (!(gt in QLRD.GAMETYPES)) {
          QLRD.igAnnounce(gt.toUpperCase() + " is not currently tracked by ecs.", true);
          QLRD.activeServerReq = false;
          return;
        }

        QLRD.igAnnounce("Collecting data from ecs webservice (" + server.players.length
          + " players)...", false);

        // Wait for all server players to be available in the QLRD cache.
        var names = $.map(server.players, function(p) { return { "name": p.name } });
        QLRD.waitFor(names, gt, function(error, players, gt) {
            // Always clear the active request flag.
            QLRD.activeServerReq = false;

            // Stop if something went wrong.
            if (error) {
              QLRD.igAnnounce("Unable to retrieve ecs data.", true);
              return;
            }

            // Wait for all server players to be available in the QLRD cache.
            var just_names = $.map(server.players, function(p) { return p.name; });

            $.ajax({
                type: "GET",
                url: "http://qlranks20917.azurewebsites.net/api/Stats/GetProfileGametypesFinished?profile=" + just_names.join(",")
              })
              .done(function(aData) {

                var games_played = $.map(aData, function(p) {
                  return { "Games": parseInt(p[QLRD.GAMETYPES[gt].toUpperCase()]), "Name": p["ProfileName"] }
                });

                games_played.sort(function(a, b) { return b.Games - a.Games; });

                var step = $.inArray(currentOut, ["echo", "print"]) > -1 ? 100 : 1000;
                var gametype = QLRD.GAMETYPES[gt];
                qz_instance.SendGameCommand(currentOut + " \"^5PLAYER_________   #" + gametype.toUpperCase() + " games completed^7\"");
                for (var i = 0; i < games_played.length; i++) {
                  (function(player, i) {
                    window.setTimeout(function() {
                      var color = player.Games < 400 ? "^3" : player.Games >= 10000 ? "^6" : "^2";
                      qz_instance.SendGameCommand(currentOut + " \"^7" + pad(player.Name, 15) + " " + color + pad(player.Games, -6) + "^7\"");
                    }, i * step);
                  })(games_played[i], i);
                }
              });
          }
        );
      }, true);
    }

    function shuffle(val, doit, args) {
      if (1 !== parseInt(val) || !quakelive.IsGameRunning()) {
        return;
      }

      // Give the request some time to complete
      if (QLRD.activeServerReq) {
        QLRD.igAnnounce("Please wait for the current request to complete...", false);
        return;
      }

      // Refresh the current server's details
      refreshServerDetails(function(server) {
        // Stop if no players were returned
        if (0 == server.players.length) {
          QLRD.igAnnounce("No players were returned by Quake Live.  "
            + "Please try again in a few seconds.", true);
          QLRD.activeServerReq = false;
          return;
        }

        // Make sure we're using a gametype tracked by QLRanks
        var gt;
        try {
          gt = mapdb.getGameTypeByID(server.game_type).title.toLowerCase();
        } catch (e) {
          QLRD.igAnnounce("Unable to determine server gametype. " + e, true);
          QLRD.activeServerReq = false;
          return;
        }
        if (!(gt in QLRD.GAMETYPES)) {
          QLRD.igAnnounce(gt.toUpperCase() + " is not currently tracked by QLRanks.", true);
          QLRD.activeServerReq = false;
          return;
        }

        QLRD.igAnnounce("Collecting QLRanks.com data...", false);

        // Wait for all server players to be available in the QLRD cache.
        var names = $.map(server.players, function(p) { return { "name": p.name } });
        QLRD.waitFor(names, gt, function(error, qlrPlayerInfo) {
          // Always clear the active request flag.
          QLRD.activeServerReq = false;

          // Stop if something went wrong.
          if (error) {
            QLRD.igAnnounce("Unable to retrieve QLRanks.com data.", true);
            return;
          }

          function getPlayerByName(players, name) {
            for (var p = 0; p < players.length; p++)
              if (players[p].name == name) return players[p];
            return {};
          }

          args = "," + args + ",";
          var players = [];
          var addAll = args.indexOf(",+all,") >= 0;
          $.each(server.players, function(i, p) {
            var name = p.name.toLowerCase();
            if (args.indexOf(",-" + name + ",") >= 0)
              return;
            // skip specs by default, but allow overrides via comma separated +playername or +all
            if (addAll || args.indexOf(",+" + name + ",") >= 0 || p.team >= 1 && p.team <= 2) {
              p.oldTeam = p.team;
              p.elo = parseInt(getPlayerByName(qlrPlayerInfo, p.name).elo);
              players.push(p);
            }
          });

          if (players.length % 2 != 0 || players.length < 2) {
            QLRD.igAnnounce(("Shuffle needs an even number of players, currently " + players.length), true);
            QLRD.igAnnounce(("Use ^3/elo shuffle,+all,+player1,-player2^7 to add/remove players"), true);
            return;
          }

          var bestdiff = 1e8;

          function k_combinations(set, k) {
            var i, j, combs, head, tailcombs;

            if (k > set.length || k <= 0) {
              return [];
            }

            if (k == set.length) {
              return [set];
            }

            if (k == 1) {
              combs = [];
              for (i = 0; i < set.length; i++) {
                combs.push([set[i]]);
              }
              return combs;
            }

            combs = [];
            for (i = 0; i < set.length - k + 1; i++) {
              head = set.slice(i, i + 1);
              tailcombs = k_combinations(set.slice(i + 1), k - 1);
              for (j = 0; j < tailcombs.length; j++) {
                combs.push(head.concat(tailcombs[j]));
              }
            }
            return combs;
          }

          function range(start, end) {
            var array = new Array();
            for (var i = start; i < end; i++) {
              array.push(i);
            }
            return array;
          }

          var team_size = players.length / 2;

          ///ecs@060714 number of team permutations is n choose k where n is server size k teamsize
          var shuffle_perms = k_combinations(range(0, players.length), team_size);

          for (var i = 0; i < shuffle_perms.length; i++) {
            var reds = 0;
            var blues = 0;

            for (var p = 0; p < players.length; p++) {
              if (shuffle_perms[i].indexOf(p) != -1) {
                reds = reds + players[p].elo;
                players[p].candidateTeam = 1;
              } else {
                blues = blues + players[p].elo;
                players[p].candidateTeam = 2;
              }
            }

            ///average it
            var reds_avg = reds / team_size;
            var blues_avg = blues / team_size;

            var diff = Math.abs((reds_avg - blues_avg));

            if (diff < bestdiff) {
              bestdiff = diff;
              for (var p = 0; p < players.length; p++)
                players[p].team = players[p].candidateTeam;
            }
          }

          // swap teams if more people would be moved than stay
          var cntStay = 0, cntMove = 0;
          for (var i = 0; i < players.length; i++) {
            if (players[i].team == players[i].oldTeam)
              ++cntStay;
            else
              ++cntMove;
          }
          if (cntMove > cntStay) {
            for (var i = 0; i < players.length; i++)
              players[i].team = 3 - players[i].team; // 2=>1, 1=>2
          }

          // Sort players by team
          players = players.sort(sortPlayerFunc("team"));

          if (doit) {
            var commands = [];

            // find out where players should be moved to
            var move = [[],[]]; // [to-red, to-blue]
            for (var i = 0; i < players.length; i++) {
              if (players[i].team != players[i].oldTeam)
                move[players[i].team - 1].push(i);
            }

            // move excessive blue players to red
            while (move[0].length > move[1].length) {
              var i = move[0][0];
              var command = "put " + players[i].clientid + " r";
              commands.push(command);
              move[0].splice(0, 1);
            }

            // move excessive red players to blue
            while (move[1].length > move[0].length) {
              var i = move[1][0];
              var command = "put " + players[i].clientid + " b";
              commands.push(command);
              move[1].splice(0, 1);
            }

            // red and blue are now equal size and can be exchanged in pairs
            for (var i = 0; i < move[0].length; i++) {
              var p = move[0][i];
              var command = "put " + players[p].clientid + " r";
              commands.push(command);
              extraQL.echo("^5" + command + "  ^2// " + players[p].name);

              var p = move[1][i];
              var command = "put " + players[p].clientid + " b";
              commands.push(command);
              extraQL.echo("^5" + command + "  ^2// " + players[p].name);
            }

            // send the put commands. needs at least 1sec delay due to server command flood protection
            var delay = 0;
            for (var i = 0; i < commands.length; i++) {
              (function(command, delay) {
                window.setTimeout(function() { qz_instance.SendGameCommand(command); }, delay);
              })(commands[i], delay);
              delay += 1100;
            }

            if (commands.length == 0)
              qz_instance.SendGameCommand("print ^2QLRD:^7 No shuffle required");
            else
              window.setTimeout(function () { qz_instance.SendGameCommand("say ^2QLRD:^7 Elo shuffle complete"); }, delay - 1000);
          }

          displayPlayers(players, doit ? "Arranging" : "Suggested");
        });
      }, false);
    }

    function showQlranksProfile(playerString) {
      var server = quakelive.serverManager.GetServerInfo(quakelive.currentServerId);
      var gt = server ? mapdb.getGameTypeByID(server.game_type).name.toLowerCase() : "duel";

      var players = playerString.split(',');
      $.each(players, function(i, player) {
        if (",duel,ca,tdm,ffa,".indexOf("," + player + ",") >= 0)
          gt = player;
        else
          quakelive.OpenURL("http://www.qlranks.com/" + gt + "/player/" + player);
      });
    }

    function calcStats(players) {
      var counts = [{ count: 0, sum: 0 }, { count: 0, sum: 0 }, { count: 0, sum: 0 }, { count: 0, sum: 0 }];

      $.each(players, function(index, player) {
        if (!parseInt(player.elo))
          return;
        counts[player.team].count++;
        counts[player.team].sum += player.elo;
        if (player.team == 1 || player.team == 2) {
          counts[0].count++;
          counts[0].sum += player.elo;
        }
      });

      var redavg = counts[1].count == 0 ? 0 : Math.round(counts[1].sum / counts[1].count);
      var bluavg = counts[2].count == 0 ? 0 : Math.round(counts[2].sum / counts[2].count);
      var gap = Math.abs(redavg - bluavg);
      var gapColor = redavg > bluavg ? "^1" : bluavg > redavg ? "^4" : "^2";

      var descr = "^1ragequit";
      if (gap < 300) descr = "^1unplayable";
      if (gap < 200) descr = "^6very unbalanced";
      if (gap < 150) descr = "^3unbalanced";
      if (gap < 100) descr = "^3challenging";
      if (gap < 80) descr = "^2balanced";
      if (gap < 40) descr = "^2very balanced";

      var teamSummary = redavg && bluavg ? " ^1" + redavg + "(" + counts[1].count + ") " + "^4" + bluavg + "(" + counts[2].count + ") ^7Gap: " + gapColor + gap + "  " + descr : "";
      return {
        allavg: counts[0].count == 0 ? 0 : Math.round(counts[0].sum / counts[0].count),
        allcount: counts[0].count,
        redavg: redavg,
        redcount: counts[1].count,
        bluavg: bluavg,
        blucount: counts[2].count,
        gap: gap,
        descr: descr,
        teamSummary: teamSummary
      }
    }

    function getTeamColor(team) {
      return team == 0 ? "^5" : team == 1 ? "^1" : team == 2 ? "^4" : "^7";
    }

    function pad(text, minLength, paddingChar) {
      if (text === undefined || text == null) text = "";
      text = text.toString();
      if (paddingChar === undefined || paddingChar == null || paddingChar == "") paddingChar = " ";
      if (minLength === undefined) minLength = 0;
      var padLeft = minLength < 0;
      minLength = Math.abs(minLength);

      var delta = 0;
      for (var i = 0; i < text.length; i++)
        if (text[i] == "^") delta++;
      while (text.length - 2 * delta < minLength)
        text = padLeft ? paddingChar + text : text + paddingChar;
      return text;
    }
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// ELO WHEN HOVERING OVER PLAYER NAME LINK
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function modifyPlayerNameLinks() {
    /**
    * Watch for hovering over profile links to show a QLRanks data title/tooltip
    */

    $("body").on("mouseover", "a", function() {
      if (this.qlndSkip) return;

      var res = RE_profile.exec(this.href) || RE_profile.exec(this.onclick),
        self = this,
        txt;

      if (!res) {
        self.qlndSkip = true;
        return;
      }

      res = res[1].toLowerCase();
      txt = self.textContent.toLowerCase();

      // Does the link text end with the player's name?
      if (-1 === txt.indexOf(res, txt.length - res.length)) {
        self.qlndSkip = true;
        return;
      }

      // "duel" is just filler
      QLRD.waitFor([{ name: res }], "duel", function(aError) {
        if (aError) {
          self.title = "Unable to load QLRanks data for " + res;
        } else {
          // NOTE: Chrome doesn't support \n in the title attr
          var p = QLRD.PLAYERS[res];
          self.title = "Duel: " + p.duel.elo + " (" + p.duel.rank + ") | "
            + "TDM: " + p.tdm.elo + " (" + p.tdm.rank + ") | "
            + "CTF: " + p.ctf.elo + " (" + p.ctf.rank + ") | "
            + "CA: " + p.ca.elo + " (" + p.ca.rank + ") | "
            + "FFA: " + p.ffa.elo + " (" + p.ffa.rank + ")";
          self.qlndSkip = true;
        }
      });
    });
  })();

////////////////////////////////////////////////////////////////////////////////////////////////////
// ELO IN THE SERVER BROWSER DETAILS COLUMN (2014-04-04)
////////////////////////////////////////////////////////////////////////////////////////////////////

  (function modifyServerBrowserDetails() {
    extraQL.addStyle(
      "#browser_details .elo { float: right; width: 40px; margin-top: 5px; text-align: right; display: inline-block; }",
      "#browser_details .eloSummary { border-top: 1px solid #666; }",
      "#browser_details .eloSumAvg { padding-top: 5px; display: inline-block; }",
      "#browser_details .eloSumRed { padding-top: 5px; margin-left: 20px; color: red; display: inline-block; }",
      "#browser_details .eloSumBlue { padding-top: 5px; margin-left: 20px; color: #4466FF; display: inline-block; }",
      "#joinServerButton.eloMatch { border: 3px solid #2F4 !important; color: #2F4 !important; }"
    );
    var oldRenderMatchDetails = quakelive.matchcolumn.RenderMatchDetails;
    var currentServer;

    quakelive.matchcolumn.RenderMatchDetails = function (node, server) {
      window.serverInfo = server;
      currentServer = server;
      oldRenderMatchDetails.call(quakelive.matchcolumn, node, server);

      showTimeLeftOrElapsed(server);

      if (!(server.gt.name.toLowerCase() in QLRD.GAMETYPES))
        return;

      var playerList = [];
      var nodeByName = {};
      $("#browser_details ul.players li").each(function() {
        var $this = $(this);
        var res = RE_profile.exec($this.find("a").attr("href"));
        if (res && res[1]) {
          var name = res[1].toLowerCase();
          playerList.push({ "name": name });
          nodeByName[name] = this;
        }
      });
      if (playerList.length == 0)
        return;

      $("#browser_details button.join-server").attr("id", "joinServerButton");

      requestQlranksData(server, nodeByName, playerList);
    }

    function requestQlranksData(requestedServer, nodeByName, playerList) {
      QLRD.waitFor(playerList, requestedServer.gt.name, function(error, players, gt) {
        if (error)
          return;

        if (requestedServer != currentServer) // data arrived after user already selected another server
          return;

        var sortStyle = getSortStyle();

        var playerSortInfos = [];
        $.each(nodeByName, function(name, elem) {
          var $node = $(elem);
          var player = QLRD.PLAYERS[name];
          var elo = player && player[gt] && player[gt].elo ? player[gt].elo : "???";
          player.rating = elo;
          $node.append("<div class='elo'><a href='javascript:quakelive.OpenURL(\"http://www.qlranks.com/" + gt + "/player/" + name + "\")' target='_blank'>" + elo + "</a></div>");
          if (sortStyle)
            $node.detach();

          var team = 0;
          var $img = $node.children("img");
          if ($img.hasClass("lgi_bordercolor_1"))
            team = 1;
          else if ($img.hasClass("lgi_bordercolor_2"))
            team = 2;
          else if ($img.hasClass("lgi_bordercolor_3"))
            team = 3;
          playerSortInfos.push({ "name": name, "elo": elo, "team": team });
        });

        if (sortStyle) {
          // reorder players
          $("#browser_details ul.players").empty(); // prevent double-fill
          playerSortInfos.sort(sortPlayerFunc(sortStyle));
        }
        var $list = $("#browser_details ul.players");
        var avgScoreSum = 0, avgRedSum = 0, avgBlueSum = 0;
        var avgScoreCount = 0, avgRedCount = 0, avgBlueCount = 0;
        $.each(playerSortInfos, function(idx, player) {
          if (sortStyle)
            $list.append(nodeByName[player.name]);
          var rating = player.elo;
          if (rating > 0) {
            if (player.team == 1) {
              ++avgRedCount;
              avgRedSum += rating;
            } else if (player.team == 2) {
              ++avgBlueCount;
              avgBlueSum += rating;
            }
            if (player.team != 3) {
              ++avgScoreCount;
              avgScoreSum += rating;
            }
          }
        });

        if (avgScoreCount > 0) {
          var avg = Math.floor(avgScoreSum / avgScoreCount);
          var red = avgRedCount > 0 ? "<span class='eloSumRed'>Red: " + Math.floor(avgRedSum / avgRedCount) + "</span>" : "";
          var blue = avgBlueCount > 0 ? "<span class='eloSumBlue'>Blue: " + Math.floor(avgBlueSum / avgBlueCount) + "</span>" : "";
          $list.append("<li class='eloSummary'><span class='eloSumAvg'>Avg:</span>" + red + blue + "<b id='qlrdBrowserSort' title='use \"/elo help\" and \"/elo sort=x\" to set a sort criteria'>[sort]</b><div class='elo'>" + avg + "</div><li>");
          var me = QLRD.PLAYERS[quakelive.username.toLowerCase()];
          if (me && me[gt] && me[gt].elo && Math.abs(avg - me[gt].elo) <= ELO_DIFF_FOR_GREEN_JOIN_BUTTON)
            $("#joinServerButton").addClass("eloMatch");
        }
      });
    }

    function showTimeLeftOrElapsed(server) {
      if (server.timelimit) {
        var secondsLeft;
        if (server.g_levelstarttime && server.g_gamestate == "IN_PROGRESS") {
          secondsLeft = server.timelimit * 60 - (Math.floor(new Date().getTime() / 1000) - server.g_levelstarttime);
          if (secondsLeft > 0 && secondsLeft <= server.timelimit * 60)
            secondsLeft = Math.floor(secondsLeft / 60) + ":" + ("0" + (secondsLeft % 60)).substr(-2, 2);
          else
            secondsLeft = "?";
        } else
          secondsLeft = server.timelimit + ":00";
        $(".serverinfo").append("<li>Time Left<b>" + secondsLeft + "</b></li>");
      } else {
        var secondsElapsed;
        if (server.g_levelstarttime && server.g_gamestate == "IN_PROGRESS") {
          secondsElapsed = Math.floor(new Date().getTime() / 1000) - server.g_levelstarttime;
          secondsElapsed = Math.floor(secondsElapsed / 60) + ":" + ("0" + secondsElapsed % 60).substr(-2, 2);
        } else
          secondsElapsed = "0:00";
        $(".serverinfo").append("<li>Time Elapsed<b>" + secondsElapsed + "</b></li>");
      }
    }
  })();
  

////////////////////////////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
////////////////////////////////////////////////////////////////////////////////////////////////////

  function sortPlayerFunc(sortStyle) {
    return function(player1, player2) {
      var key1 = sortCriteria(player1, sortStyle);
      var key2 = sortCriteria(player2, sortStyle);
      return key1 < key2 ? -1 : key1 > key2 ? +1 : 0;
    };
  }

  function sortCriteria(player, sortPref) {
    var score = player.elo;
    score = isNaN(parseInt(score)) ? "9999" : ("0000" + (10000 - score)).substr(-4);
    var isSpec = player.team == 3 ? "1" : "0";
    var crit = sortPref == "team" ? player.team + score + player.name : isSpec + score + player.name;
    return crit;
  }

  function getSortStyle() {
    var sortStyle = PREFS.sort;
    if (sortStyle != "elo" && sortStyle != "team")
      sortStyle = "";
    return sortStyle;
  }

})();