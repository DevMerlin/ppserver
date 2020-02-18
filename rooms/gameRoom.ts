import { Room, Client } from "colyseus";
import { Schema, type, MapSchema  } from "@colyseus/schema";
import e = require("express");

export class Player extends Schema {
  constructor(clientID: string, color: number = 0, username: string = "")
  {
      super();

      if (username == "")
      {
        this.username = "Guest_" + Math.floor(Math.random() * 3000000);
      } else {
        this.username = username;
      }

      this.color = color;
      this.clientID = clientID;
  }

  @type("string")
  clientID = "";
  @type("string")
  username = "";
  @type("number")
  x = 0;
  @type("number")
  y = 0;
  @type("number")
  score = 0;
  @type("number")
  color = 1;    
  @type("boolean")
  isPlaying = true;    
}

export class Bubble extends Schema {
  @type("number")
  color = 0;
  @type("number")
  index = 0;
  @type("boolean")
  popped = false;
  @type("number")
  item = 0;
  @type("string")
  poppedBy = ""; 
}

export class State extends Schema {
  @type({ map: Player })
  players = new MapSchema<Player>();

  @type({ map: Bubble })
  bubbles = new MapSchema<Bubble>();

  setPlayerActive(data: any, id: string)
  {
    let player = this.players[id];

    player.username = data.username;
    player.userType = 1;
    player.score = 0;
    player.color = data.color;
    player.canPlay = true;
    this.players[id] = player;
  }

  setPlayerGuest(data: any, id: string)
  {
    let player = this.players[id];

    player.username = data.username;
    player.userType = 0;
    player.score = 0;
    player.canPlay = false;
    this.players[id] = player;    
  }

  setupBubbles()
  {
    for(let i = 0; i < (13 * 10); i++)
    {
      let obj = this.bubbles[i] = new Bubble();
      obj.color = this.chooseColor();
      obj.index = i;
    }
  }

  resetBubbles()
  {
    for(let i = 0; i < (13 * 10); i++)
    {
      let obj = this.bubbles[i];



      obj.color = this.chooseColor();
      obj.popped = false;
      this.bubbles[i] = obj;
    }
  } 
  
  chooseColor()
  {
    var r = Math.random();

    if (r > 0.90)
    {
      return 6;
    } else {
      return Math.floor(Math.random() * 6);
    }

  }

  popAlmostAll()
  {
    for(let i = 0; i < (13 * 10) - 2; i++)
    {
      let obj = this.bubbles[i];
      obj.popped = true;
      this.bubbles[i] = obj;
    }    
  }

  movePlayer(clientId: string, data: any)
  {
    this.players[clientId].x = data.x;
    this.players[clientId].y = data.y;
  }

  checkResetState()
  {
    let x = 0;
    for(let i = 0; i < (13 * 10); i++)
    {
      let obj = this.bubbles[i];
      if (obj.popped)
      {
        x++;
      }
    }
    
    if (x === (13 * 10))
    {
      return true;
    } else {
      return false;
    }
  }

  popBubble(bubbleIndex: number, clientId: string)
  {
    let bubble = this.bubbles[bubbleIndex];
    let player = this.players[clientId];
    let score = 0;
    if (!bubble.popped) {
      // Does the bubble color match the player color? //
      if (player.color == bubble.color)
      {
        score = 20;
      } else { 
        if (bubble.color == 0)
        {
          score = 2;
        } else if (bubble.color == 6) {
          score = -15;
        } else {
          score = 10;
        }
      }

      player.score += score;
      bubble.popped = true;
      this.bubbles[bubbleIndex] = bubble;
      this.players[clientId] = player;
      return { popped: true, points: score, player: clientId };
    } else {
      return false;
    }
  }

  removePlayer(id: string)
  {
    delete this.players[id];
  }
}

export class gameRoom extends Room<State> {

  maxClients = 6;

  onCreate (options: any) {
    this.setState(new State());
    this.state.setupBubbles();
  }

  onJoin (client: any, options: any) {
    this.state.players[client.sessionId] = new Player(client.sessionId, options.color, options.username);
    this.send(client, {com: "connected", player: this.state.players[client.sessionId], players: this.state.players});

    this.broadcast({ com: "newPlayer", player: this.state.players[client.sessionId] }, { except: client });
  }

  onMessage (client: Client, message: any) {
    let msgOb = message;
    switch(msgOb.msg)
    {
      case "time":
        let msg = {com: "time", msg: { time: msgOb.time, delta: this.getTime() } };
        this.send(client, msg);
      break;
      case "pop":
        let check = (this.state.popBubble(msgOb.data, client.sessionId) as any);

        if (check.popped)
        {
          this.broadcast({com: "popped", msg: { "bubble": msgOb.data, "player" : check.player, "score": check.points } });

          if (this.state.checkResetState())
          {
            this.state.resetBubbles();
            this.broadcast({com: "roundOver", msg: { "bubbles": this.state.bubbles, "players": this.state.players }});
          }          
        }
      break;
      case "move":
        let data = msgOb.data;
        this.state.movePlayer(client.sessionId, {x: data.x, y: data.y});
      break;
      case "fin.":
        this.state.popAlmostAll();
        this.broadcast({com: "fin.", msg: { "bubbles": this.state.bubbles }});
      break;
    }
  }

  getTime()
  {
    let dt = new Date();
    let epoch = new Date(1970, 1, 1).getMilliseconds();
    return Math.round(dt.getTime() - epoch);
  }

  onLeave (client: Client, consented: boolean) {
    this.state.removePlayer(client.sessionId);
  }

  onDispose() {

  }

}