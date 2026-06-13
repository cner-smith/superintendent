defmodule SensorServiceWeb.ChannelCase do
  @moduledoc """
  Test case template for Phoenix Channel tests.

  Sets up the SQL sandbox and imports Phoenix.ChannelTest helpers so tests
  can call `subscribe_and_join/3`, `assert_push/3`, `assert_broadcast/3`, etc.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest

      @endpoint SensorServiceWeb.Endpoint

      import SensorServiceWeb.ChannelCase
    end
  end

  setup tags do
    SensorService.DataCase.setup_sandbox(tags)
    :ok
  end
end
