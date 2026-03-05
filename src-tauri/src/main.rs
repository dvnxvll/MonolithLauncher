#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  println!("Monolith backend started");
  app_lib::run();
}
