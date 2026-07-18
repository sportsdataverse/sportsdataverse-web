type Props = {
  children?: string | React.ReactNode;
};

export default function Code(props: Props) {
  return (
    <>
      {typeof props.children === "string" ? (
        <code className="!bg-secondary p-0.5 rounded before:text-secondary after:text-secondary text-secondary-foreground">
          {props.children}
        </code>
      ) : (
        <code>{props.children}</code>
      )}
    </>
  );
}
