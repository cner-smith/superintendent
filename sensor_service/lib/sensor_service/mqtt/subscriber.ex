defmodule SensorService.MQTT.Subscriber do
  @moduledoc """
  Tortoise311 handler that ingests sensor readings arriving over MQTT.

  Subscribes to `superintendent/sensors/+/+`. Each message carries:
    - topic levels `["superintendent", "sensors", "<node_id>", "<depth_band>"]`
    - payload JSON `{"value": <float>, "at": "<ISO8601>"}`

  On a well-formed message it calls `SensorService.Sensors.insert_reading/1`,
  which persists the row and broadcasts `{:sensor_reading, payload}` on PubSub.
  Malformed topics or payloads are logged and skipped — the handler never crashes.
  """

  use Tortoise311.Handler

  require Logger

  alias SensorService.Sensors

  @type state :: %{}

  @impl Tortoise311.Handler
  def init(_args), do: {:ok, %{}}

  @impl Tortoise311.Handler
  def connection(:up, state) do
    Logger.info("MQTT Subscriber: connected to broker")
    {:ok, state}
  end

  def connection(:down, state) do
    Logger.warning("MQTT Subscriber: disconnected from broker")
    {:ok, state}
  end

  @impl Tortoise311.Handler
  def subscription(:up, topic_filter, state) do
    Logger.info("MQTT Subscriber: subscribed to #{topic_filter}")
    {:ok, state}
  end

  def subscription(:down, topic_filter, state) do
    Logger.info("MQTT Subscriber: unsubscribed from #{topic_filter}")
    {:ok, state}
  end

  @impl Tortoise311.Handler
  def handle_message(topic_levels, payload, state) do
    handle_inbound(topic_levels, payload)
    {:ok, state}
  end

  @impl Tortoise311.Handler
  def terminate(_reason, _state), do: :ok

  # ---------------------------------------------------------------------------
  # Public helper — also called directly in unit tests (no live broker needed).
  # ---------------------------------------------------------------------------

  @doc """
  Parse and ingest one MQTT message. Exposed so unit tests can exercise the
  parsing + ingest logic without a live broker.

  Returns `:ok` on success or `:skip` when the message is malformed.
  """
  @spec handle_inbound([String.t()], binary() | nil) :: :ok | :skip
  def handle_inbound(["superintendent", "sensors", node_id_str, depth_band], payload)
      when is_binary(node_id_str) and is_binary(depth_band) do
    with {:ok, node_id} <- parse_node_id(node_id_str),
         {:ok, value, at} <- parse_payload(payload) do
      attrs = %{node_id: node_id, depth_band: depth_band, value: value, at: at}

      case Sensors.insert_reading(attrs) do
        {:ok, _reading} ->
          :ok

        {:error, changeset} ->
          Logger.warning(
            "MQTT Subscriber: insert_reading failed for node #{node_id}/#{depth_band}: " <>
              inspect(changeset.errors)
          )

          :skip
      end
    else
      {:error, reason} ->
        Logger.warning(
          "MQTT Subscriber: skipping malformed message " <>
            "topic=#{Enum.join(["superintendent", "sensors", node_id_str, depth_band], "/")} " <>
            "reason=#{inspect(reason)}"
        )

        :skip
    end
  end

  def handle_inbound(topic_levels, _payload) do
    Logger.warning("MQTT Subscriber: unexpected topic structure: #{inspect(topic_levels)}")
    :skip
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp parse_node_id(str) do
    case Integer.parse(str) do
      {id, ""} when id > 0 -> {:ok, id}
      _ -> {:error, {:invalid_node_id, str}}
    end
  end

  defp parse_payload(nil), do: {:error, :empty_payload}

  defp parse_payload(raw) when is_binary(raw) do
    with {:ok, %{"value" => value, "at" => at_str}} <- Jason.decode(raw),
         true <- is_number(value),
         {:ok, at, _offset} <- DateTime.from_iso8601(at_str) do
      {:ok, value / 1, at}
    else
      {:ok, decoded} ->
        {:error, {:missing_fields, decoded}}

      false ->
        {:error, :value_not_a_number}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
