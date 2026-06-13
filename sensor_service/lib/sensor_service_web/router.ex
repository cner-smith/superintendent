defmodule SensorServiceWeb.Router do
  use SensorServiceWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SensorServiceWeb do
    pipe_through :api
  end
end
