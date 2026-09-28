# EcoDash: Village Delivery Run

EcoDash is a small browser game built with HTML, CSS, and JavaScript. You drive an electric delivery vehicle through a stylised village, deliver parcels to homes, avoid hazards, and manage your battery while the grid experiences occasional outages.

## Overview

This project is a lightweight canvas-based game where the player:

- drives around a village map
- collects and delivers packages
- avoids potholes and blocked terrain
- recharges at the charging station
- manages battery power and score

## Features

- top-down driving gameplay using keyboard or on-screen controls
- dynamic mission system with multiple delivery points
- battery drain and automatic charging mechanic
- load-shedding / outage events that temporarily disable charging stations
- score tracking and best score saving in local storage
- responsive UI with overlays, mission HUD, and touch controls

## Controls

- W, A, S, D or Arrow keys: drive and steer
- E: interact / deliver parcel / charge when at a valid target
- P or Escape: pause the game
- Mouse/touch: use the on-screen buttons provided in the interface

## Objective

Deliver all four packages to the assigned homes while keeping the battery alive. If the battery reaches zero, the run ends. You can recharge at the charge station, but the station may be offline during load-shedding periods.

## How to Run

Because this is a static web project, you can run it in either of these ways:

1. Open index.html directly in a browser, or
2. Serve the project locally using a simple web server, for example:
