defmodule SensorServiceWeb.SensorsChannelTest do
  @moduledoc """
  Tests for the realtime sensor telemetry channel.

  1. A client that joins sensors:<parcel_id> receives a `new_reading` push
     whenever a reading is inserted for a node in that parcel.
  2. Readings are persisted — the DB row exists after insert.
  3. The join ok-reply contains `nodes` and `readings` state for the parcel.
  """

  use SensorServiceWeb.ChannelCase, async: false

  alias SensorService.Sensors
  alias SensorService.Repo
  alias SensorService.Sensors.SensorReading

  @parcel_id "00000000-0000-0000-0000-000000000099"

  setup do
    {:ok, node} =
      Sensors.insert_node(%{
        parcel_id: @parcel_id,
        label: "Test Node",
        lat: 38.5,
        lng: -121.7
      })

    {:ok, socket} = connect(SensorServiceWeb.UserSocket, %{}, connect_info: %{})
    {:ok, reply, socket} = subscribe_and_join(socket, "sensors:#{@parcel_id}", %{})

    %{node: node, socket: socket, reply: reply}
  end

  test "broadcast: subscriber receives new_reading push on insert", %{node: node} do
    at = DateTime.utc_now()

    {:ok, _reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "0-4in",
        value: 42.5
      })

    assert_push "new_reading", %{
      node_id: node_id,
      depth_band: "0-4in",
      value: 42.5
    }

    assert node_id == node.id
  end

  test "persistence: reading row exists in DB after insert", %{node: node} do
    at = DateTime.utc_now()

    {:ok, reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "4-8in",
        value: 27.3
      })

    persisted = Repo.get(SensorReading, reading.id)
    assert persisted != nil
    assert persisted.depth_band == "4-8in"
    assert_in_delta persisted.value, 27.3, 0.001
    assert persisted.node_id == node.id
  end

  test "broadcast payload contains iso8601 at timestamp", %{node: node} do
    at = DateTime.utc_now()

    {:ok, _reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "8-12in",
        value: 19.0
      })

    assert_push "new_reading", %{at: at_str}
    assert {:ok, _, _} = DateTime.from_iso8601(at_str)
  end

  test "join reply contains nodes list for the parcel", %{node: node, reply: reply} do
    assert %{nodes: nodes} = reply
    assert is_list(nodes)
    assert length(nodes) >= 1

    node_ids = Enum.map(nodes, & &1.id)
    assert node.id in node_ids

    Enum.each(nodes, fn n ->
      assert Map.has_key?(n, :id)
      assert Map.has_key?(n, :label)
      assert Map.has_key?(n, :lat)
      assert Map.has_key?(n, :lng)
      assert n.depth_bands == ["0-4in", "4-8in", "8-12in"]
    end)
  end

  test "join reply contains readings list (empty or populated) with correct shape", %{
    node: node,
    reply: _reply
  } do
    # Insert a reading so there is at least one to assert structure on.
    {:ok, _} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: DateTime.utc_now(),
        depth_band: "0-4in",
        value: 33.3
      })

    # Re-join on a fresh socket to get a reply that includes the new reading.
    {:ok, socket2} = connect(SensorServiceWeb.UserSocket, %{}, connect_info: %{})
    {:ok, reply2, _socket2} = subscribe_and_join(socket2, "sensors:#{@parcel_id}", %{})

    assert %{readings: readings} = reply2
    assert is_list(readings)
    assert length(readings) >= 1

    Enum.each(readings, fn r ->
      assert Map.has_key?(r, :node_id)
      assert Map.has_key?(r, :depth_band)
      assert Map.has_key?(r, :value)
      assert Map.has_key?(r, :at)
      # at must be a valid ISO8601 string
      assert {:ok, _, _} = DateTime.from_iso8601(r.at)
    end)
  end
end
